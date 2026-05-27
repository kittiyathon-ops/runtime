import { execSync } from "node:child_process";

const INTERVAL_SECONDS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(command: string): void {
  console.log("");
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

async function countdown(seconds: number): Promise<void> {
  for (let i = seconds; i >= 0; i -= 1) {
    process.stdout.write(`\rnext observer cycle in ${i}s   `);
    await sleep(1000);
  }

  process.stdout.write("\n");
}

async function main(): Promise<void> {
  while (true) {
    console.clear();

    console.log("==================================");
    console.log(" ETH RUNTIME OBSERVER");
    console.log("==================================");
    console.log("time:", new Date().toISOString());
    console.log("mode: public data only / no API key / no order");
    console.log("");

    try {
      run("pnpm scan:eth-now");
      run("pnpm outcome:eth");
    } catch (err) {
      console.error("");
      console.error("ETH_RUNTIME_OBSERVER_CYCLE_FAILED");
      console.error(err);
    }

    console.log("");
    await countdown(INTERVAL_SECONDS);
  }
}

main().catch(err => {
  console.error("ETH_RUNTIME_OBSERVER_FATAL");
  console.error(err);
  process.exit(1);
});
