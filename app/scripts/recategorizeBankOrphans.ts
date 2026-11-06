import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { recategorizeOrphanBankTransactions } from "../src/lib/bankPipeline";
import { UserFinancialPayload } from "../src/lib/cloudSync";

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const isApply = args.includes("--apply") || args.includes("--no-dry-run");
  const dryRun = !isApply;

  let filterUserId = "";
  const userArgIdx = args.findIndex((a) => a === "--user" || a === "--userId");
  if (userArgIdx !== -1 && args[userArgIdx + 1]) {
    filterUserId = args[userArgIdx + 1].trim();
  }

  console.log("==================================================");
  console.log(" 🏷️  SCRIPT DE RECATÉGORISATION DES ORPHELINES BANCAIRES");
  console.log("==================================================");
  if (dryRun) {
    console.log(" MODE : SIMULATION (DRY-RUN) PAR DÉFAUT");
    console.log(" ℹ️  Aucune écriture ne sera effectuée.");
    console.log("    Pour exécuter la recatégorisation réelle, passez l'option : --apply");
  } else {
    console.log(" ⚠️  MODE : RECATÉGORISATION RÉELLE (--apply)");
  }
  console.log("==================================================\n");

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!dbUrl) {
    console.warn("⚠️  DATABASE_URL non définie. Analyse du store local .krona-cloud/users-cloud-store.json...");
    const storePath = path.resolve(process.cwd(), ".krona-cloud", "users-cloud-store.json");
    if (!fs.existsSync(storePath)) {
      console.error("❌ Aucune base de données Neon ni store local trouvé.");
      process.exit(1);
    }
    const raw = fs.readFileSync(storePath, "utf-8");
    const store = JSON.parse(raw) as Record<string, UserFinancialPayload>;
    let totalRecat = 0;

    const targetUsers = filterUserId ? [filterUserId] : Object.keys(store);

    for (const userId of targetUsers) {
      const payload = store[userId];
      if (!payload || !Array.isArray(payload.transactions)) continue;

      const orphanCount = payload.transactions.filter(
        (t) => (t.source === "bank" || t.id.startsWith("eb_")) && t.type === "Autre"
      ).length;

      if (orphanCount === 0) continue;

      console.log(`👤 Utilisateur : ${userId}`);
      console.log(`   - Opérations bancaires en 'Autre' trouvées : ${orphanCount}`);

      const currentRules = payload.learningRules || payload.merchantKnowledge || {};
      const result = await recategorizeOrphanBankTransactions({
        transactions: payload.transactions,
        learningRules: currentRules,
      });

      console.log(`   - Opérations recatégorisables : ${result.recategorizedCount}`);

      for (let i = 0; i < payload.transactions.length; i++) {
        const oldTx = payload.transactions[i];
        const newTx = result.updatedTransactions[i];
        if (oldTx && newTx && oldTx.type !== newTx.type) {
          console.log(`     • [${oldTx.date}] ${oldTx.amount.toFixed(2)} € | "${newTx.name}" : "Autre" ➔ "${newTx.type}"`);
        }
      }

      if (!dryRun && result.recategorizedCount > 0) {
        payload.transactions = result.updatedTransactions;
        payload.learningRules = result.learningRules;
        payload.merchantKnowledge = result.learningRules;
        totalRecat += result.recategorizedCount;
        console.log(`   ✅ ${result.recategorizedCount} opération(s) mise(s) à jour pour ${userId}`);
      }
      console.log("");
    }

    if (!dryRun && totalRecat > 0) {
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
      console.log(`💾 Store local mis à jour : ${totalRecat} opération(s) recatégorisée(s).`);
    } else if (dryRun) {
      console.log(`🔒 Mode simulation : le fichier local n'a pas été modifié.`);
    }

    return;
  }

  const sql = neon(dbUrl);
  console.log("🔗 Connexion à la base Neon PostgreSQL établie.");

  const rows = filterUserId
    ? await sql.query("SELECT user_id, email, data FROM user_sync WHERE user_id = $1;", [filterUserId])
    : await sql.query("SELECT user_id, email, data FROM user_sync;");

  console.log(`🔍 Analyse de ${rows.length} profil(s) utilisateur(s)...\n`);

  let totalRecategorized = 0;

  for (const row of rows) {
    const record = row as unknown as { user_id: string; email: string | null; data: unknown };
    const payload = (
      typeof record.data === "string" ? JSON.parse(record.data) : record.data
    ) as UserFinancialPayload;

    if (!payload || !Array.isArray(payload.transactions)) continue;

    const beforeOrphans = payload.transactions.filter(
      (t) => (t.source === "bank" || t.id.startsWith("eb_")) && t.type === "Autre"
    ).length;

    if (beforeOrphans === 0) continue;

    console.log(`👤 Utilisateur: ${record.user_id} (${record.email || "sans email"})`);
    console.log(`   - Opérations bancaires en 'Autre' trouvées : ${beforeOrphans}`);

    const currentRules = payload.learningRules || payload.merchantKnowledge || {};
    const result = await recategorizeOrphanBankTransactions({
      transactions: payload.transactions,
      learningRules: currentRules,
    });

    console.log(`   - Opérations recatégorisables : ${result.recategorizedCount}`);

    for (let i = 0; i < payload.transactions.length; i++) {
      const oldTx = payload.transactions[i];
      const newTx = result.updatedTransactions[i];
      if (oldTx && newTx && oldTx.type !== newTx.type) {
        console.log(`     • [${oldTx.date}] ${oldTx.amount.toFixed(2)} € | "${newTx.name}" : "Autre" ➔ "${newTx.type}"`);
      }
    }

    if (!dryRun && result.recategorizedCount > 0) {
      payload.transactions = result.updatedTransactions;
      payload.learningRules = result.learningRules;
      payload.merchantKnowledge = result.learningRules;

      await sql.query(
        `UPDATE user_sync
         SET data = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2;`,
        [JSON.stringify(payload), record.user_id]
      );

      totalRecategorized += result.recategorizedCount;
      console.log(`   ✅ Recatégorisées en base : ${result.recategorizedCount} opération(s)`);
    }
    console.log("");
  }

  console.log("==================================================");
  console.log(`📊 TOTAL OPÉRATIONS RECATÉGORISÉES : ${totalRecategorized}`);
  if (dryRun) {
    console.log("🔒 SIMULATION : Aucune modification écrite dans la base Neon.");
    console.log("💡 Pour appliquer les modifications, relancez avec : npm run recategorize-orphans -- --apply");
  } else {
    console.log(`✅ SUCCÈS : ${totalRecategorized} opération(s) mise(s) à jour dans Neon.`);
  }
  console.log("🛡️  Aucune requête vers l'API bancaire n'a été effectuée.");
  console.log("==================================================");
}

main().catch((err: unknown) => {
  console.error("❌ Erreur lors de la recatégorisation :", err);
  process.exit(1);
});
