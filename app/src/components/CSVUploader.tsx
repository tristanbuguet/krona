"use client";

import { useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";

export function CSVUploader({ onUpload }: { onUpload: (data: any[]) => void }) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        delimiter: ";",
        complete: (results) => {
          onUpload(results.data);
        },
      });
    }
  }, [onUpload]);

  const { getInputProps, open } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    noDrag: true, // we handle drag elsewhere if needed, but for now just the button
  });

  useEffect(() => {
    const handleTrigger = () => {
      open();
    };
    window.addEventListener("trigger-csv-upload", handleTrigger);
    return () => window.removeEventListener("trigger-csv-upload", handleTrigger);
  }, [open]);

  return (
    <div className="hidden">
      <input {...getInputProps()} />
    </div>
  );
}
