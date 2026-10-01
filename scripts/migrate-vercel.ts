import { execFileSync } from "node:child_process";
import { shouldMigrateDeployment } from "./lib/deployment-migrations";

if (shouldMigrateDeployment(process.env)) {
  execFileSync("npm", ["run", "db:migrate"], { stdio: "inherit" });
} else {
  console.log("Skip migrations outside the Vercel production build.");
}
