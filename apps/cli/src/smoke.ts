/**
 * 烟测：仅跑数据链路，不调 LLM。
 * 用法：npx tsx apps/cli/src/smoke.ts 600519
 */
import { buildDataPack } from "@vc/data";

const code = process.argv[2] ?? "600519";

(async () => {
  const t0 = Date.now();
  const pack = await buildDataPack(code);
  const ms = Date.now() - t0;
  console.log(`code=${pack.code}  fetched_in=${ms}ms`);
  console.log("--- profile (excerpt) ---");
  console.log(JSON.stringify(pack.profile, null, 2).slice(0, 400));
  console.log("--- valuation ---");
  console.log(JSON.stringify(pack.valuation, null, 2));
  console.log("--- quote ---");
  console.log(JSON.stringify(pack.quote, null, 2));
  console.log("--- financial ---");
  const fin = pack.financial as any;
  console.log(`row_count=${fin?.row_count}  latest=${fin?.rows?.[0]?.["日期"]}`);
})().catch((e) => { console.error(e); process.exit(1); });
