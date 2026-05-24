import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const HISTORY_DIR = "data";
const HISTORY_FILE =
  path.join(HISTORY_DIR, "eth-market-history.jsonl");

if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, {
    recursive: true
  });
}

function appendHistory(entry: unknown) {

  fs.appendFileSync(
    HISTORY_FILE,
    JSON.stringify(entry) + "\n"
  );
}

function runScan(): unknown {

  const output =
    execSync(
      "pnpm scan:eth-now",
      { encoding: "utf8" }
    );

  return JSON.parse(output);
}

async function loop() {

  while (true) {

    console.clear();

    console.log("==================================");
    console.log(" ETH MARKET HISTORY LOGGER");
    console.log("==================================");
    console.log("");

    try {

      const result =
        runScan();

      appendHistory({
        timestamp:
          new Date().toISOString(),
        ...result
      });

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      console.log("");
      console.log(
        `saved -> ${HISTORY_FILE}`
      );

    } catch (err) {

      console.error(
        "LOGGER_FAILED",
        err
      );
    }

    for (
      let i = 300;
      i >= 0;
      i--
    ) {

      process.stdout.write(
        `\rnext scan in ${i}s   `
      );

      await new Promise(
        resolve =>
          setTimeout(resolve, 1000)
      );
    }

    process.stdout.write("\n");
  }
}

loop();