/**
 * `node tools/site-check/src/cli.ts <site url>`: CI's confirm job runs it once the live
 * version.json names the commit. Prints each path it checked; exits 1 with an error per problem.
 */
import { checkSite } from './check.ts';

const site = process.argv[2];
if (!site) {
  console.error('usage: node tools/site-check/src/cli.ts <site url>');
  process.exit(2);
}
const { checked, failures } = await checkSite(site);
for (const path of checked) console.log(`checked ${path}`);
for (const failure of failures) console.log(`::error::${failure}`);
if (failures.length > 0) process.exitCode = 1;
