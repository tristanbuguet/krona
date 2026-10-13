"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { parseBankCsvFile, BankType, NormalizedTransaction } from "@/lib/bankParser";

export function CSVUploader({
  onUpload,
  onStart,
}: {
  onUpload: (data: NormalizedTransaction[]) => void;
  onStart?: () => void;
}) {
  const selectedBankRef = useRef<BankType | undefined>(undefined);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        if (onStart) onStart();
        try {
          const bank = selectedBankRef.current || (typeof window !== "undefined" ? (localStorage.getItem("krona_selected_bank") as BankType) || undefined : undefined);
          const result = await parseBankCsvFile(file, bank);
          selectedBankRef.current = undefined;
          onUpload(result.transactions);
        } catch (err) {
          console.error("Erreur lors du traitement du fichier CSV :", err);
          selectedBankRef.current = undefined;
        }
      }
    },
    [onUpload, onStart]
  );

  const { getInputProps, open } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    noDrag: true,
  });

  useEffect(() => {
    const handleTrigger = (e: any) => {
      const activeBank = e.detail?.bank || (typeof window !== "undefined" ? (localStorage.getItem("krona_selected_bank") as BankType) || "bourso" : "bourso");
      selectedBankRef.current = activeBank;
      open();
    };

    window.addEventListener("trigger-csv-upload", handleTrigger);
    return () => window.removeEventListener("trigger-csv-upload", handleTrigger);
  }, [open]);

  return (
    <div className="hidden">
      <input 
        {...getInputProps({
          onChange: (e: any) => {
            if (e.target.files && e.target.files.length > 0) {
              onStart?.();
            }
          }
        })} 
      />
    </div>
  );
}
