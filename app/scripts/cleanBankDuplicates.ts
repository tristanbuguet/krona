import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { cleanDatabaseDuplicates } from "../src/lib/bankDeduplication";
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

  // Filtrage optionnel par utilisateur spécifique
  let filterUserId = "";
  const userArgIdx = args.findIndex((a) => a === "--user" || a === "--userId");
  if (userArgIdx !== -1 && args[userArgIdx + 1]) {
    filterUserId = args[userArgIdx + 1].trim();
  }

  console.log("==================================================");
  console.log(" 🧹 SCRIPT DE NETTOYAGE DES DOUBLONS BANCAIRES");
  console.log("==================================================");
  if (dryRun) {
    console.log(" MODE : SIMULATION (DRY-RUN) PAR DÉFAUT");
    console.log(" ℹ️  Aucune transaction ne sera supprimée.");
    console.log("    Pour exécuter la suppression réelle, passez l'option : --apply");
  } else {
    console.log(" ⚠️  MODE : SUPPRESSION RÉELLE (--apply)");
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
    let totalDuplicatesDetected = 0;

    const targetUsers = filterUserId ? [filterUserId] : Object.keys(store);

    for (const userId of targetUsers) {
      const payload = store[userId];
      if (!payload || !Array.isArray(payload.transactions)) continue;

      const transactionsBefore = payload.transactions.length;
      const { cleanedTransactions, removedDuplicatesCount, removedTransactions } = cleanDatabaseDuplicates(
        payload.transactions
      );

      console.log(`👤 Utilisateur : ${userId}`);
      console.log(`   - Nombre de transactions avant : ${transactionsBefore}`);
      console.log(`   - Nombre de doublons détectés  : ${removedDuplicatesCount}`);

      if (removedDuplicatesCount > 0) {
        totalDuplicatesDetected += removedDuplicatesCount;
        console.log(`   - Liste détaillée des doublons :`);
        removedTransactions.forEach((tx, idx) => {
          const isCsv = tx.source === "csv" || /^(bourso|ca|ce|lcl|csv)_/i.test(tx.id);
          const sourceLabel = isCsv ? "CSV" : "Banque";
          console.log(
            `     ${idx + 1}. [Date: ${tx.date}] Montant: ${tx.amount.toFixed(2)} € | Commerçant: "${tx.name}" | Source: ${sourceLabel} (id: ${tx.id})`
          );
        });

        if (!dryRun) {
          payload.transactions = cleanedTransactions;
          console.log(`   ✅ ${removedDuplicatesCount} doublon(s) supprimé(s) pour ${userId}`);
        }
      } else {
        console.log(`   ✨ Aucun doublon détecté.`);
      }
      console.log("");
    }

    if (!dryRun && totalDuplicatesDetected > 0) {
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
      console.log(`💾 Store local mis à jour : ${totalDuplicatesDetected} doublon(s) purgé(s).`);
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

  let totalDuplicatesDetected = 0;

  for (const row of rows) {
    const record = row as unknown as { user_id: string; email: string | null; data: unknown };
    const payload = (
      typeof record.data === "string" ? JSON.parse(record.data) : record.data
    ) as UserFinancialPayload;

    if (!payload || !Array.isArray(payload.transactions)) continue;

    const transactionsBefore = payload.transactions.length;
    const { cleanedTransactions, removedDuplicatesCount, removedTransactions } = cleanDatabaseDuplicates(
      payload.transactions
    );

    console.log(`👤 Utilisateur : ${record.user_id} (${record.email || "sans email"})`);
    console.log(`   - Nombre de transactions avant : ${transactionsBefore}`);
    console.log(`   - Nombre de doublons détectés  : ${removedDuplicatesCount}`);

    if (removedDuplicatesCount > 0) {
      totalDuplicatesDetected += removedDuplicatesCount;
      console.log(`   - Liste détaillée des doublons :`);
      removedTransactions.forEach((tx, idx) => {
        const isCsv = tx.source === "csv" || /^(bourso|ca|ce|lcl|csv)_/i.test(tx.id);
        const sourceLabel = isCsv ? "CSV" : "Banque";
        console.log(
          `     ${idx + 1}. [Date: ${tx.date}] Montant: ${tx.amount.toFixed(2)} € | Commerçant: "${tx.name}" | Source: ${sourceLabel} (id: ${tx.id})`
        );
      });

      if (!dryRun) {
        payload.transactions = cleanedTransactions;
        await sql.query(
          `UPDATE user_sync
           SET data = $1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2;`,
          [JSON.stringify(payload), record.user_id]
        );
        console.log(`   ✅ ${removedDuplicatesCount} doublon(s) supprimé(s) dans Neon pour ${record.user_id}`);
      }
    } else {
      console.log(`   ✨ Aucun doublon détecté.`);
    }
    console.log("");
  }

  console.log("==================================================");
  console.log(`📊 TOTAL DOUBLONS DÉTECTÉS : ${totalDuplicatesDetected}`);
  if (dryRun) {
    console.log("🔒 SIMULATION : Aucune modification effectuée dans la base Neon.");
    console.log("💡 Pour appliquer les suppressions, relancez avec : npm run clean-duplicates -- --apply");
  } else {
    console.log(`✅ SUCCÈS : ${totalDuplicatesDetected} doublon(s) supprimé(s) dans Neon.`);
  }
  console.log("🛡️  Aucune requête vers l'API bancaire n'a été effectuée.");
  console.log("==================================================");
}

main().catch((err: unknown) => {
  console.error("❌ Erreur lors du nettoyage :", err);
  process.exit(1);
});
