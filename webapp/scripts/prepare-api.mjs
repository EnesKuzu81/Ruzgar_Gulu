// Vercel yalnızca webapp/ klasörünü yükler; hesap modülleri (core/) ve varsayımlar (config/) api/_lib altına kopyalanır.
import { cpSync, rmSync } from "node:fs";
rmSync("api/_lib", { recursive: true, force: true });
const skip = src => !src.includes("__pycache__");
cpSync("../core", "api/_lib/core", { recursive: true, filter: skip });
cpSync("../config", "api/_lib/config", { recursive: true, filter: skip });
console.log("api/_lib hazır (core + config)");
