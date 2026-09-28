"use strict";
const health = require("./data-health");
function loadBundledData() {
  const ctx = require("./scripts/load-data").loadData();
  return { players: ctx.PLAYERS, data: ctx.PDATA, tags: ctx.CATS };
}
if (require.main === module) {
  const { players, data, tags } = loadBundledData();
  const report = health.audit(players, data, tags);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      "Bundled data audit — internal consistency only; does not verify source accuracy or NBA pool completeness."
    );
    console.log("Players: " + report.players);
    [
      "errors",
      "missingData",
      "orphanData",
      "missingAdp",
      "missingLast",
      "missingLastTotal",
      "missingCv",
      "missingMpg",
      "untagged",
      "placeholderTeams",
      "movers",
      "roleDeltaUp",
      "roleDeltaDown",
      "roleDeltaFlat",
      "roleDeltaUnknown",
      "missingTeamPrev",
      "withProjMpg",
      "withProjRank",
      "withVacatedGainers",
    ].forEach((key) => {
      console.log(
        key +
          ": " +
          report[key].length +
          (report[key].length ? "\n  " + report[key].join(", ") : "")
      );
    });
    console.log("Largest built-in rank / ADP gaps (40+ picks; review signals, not proven errors):");
    report.rankDivergence
      .slice(0, 15)
      .forEach((p) => console.log(`  ${p.name}: rank ${p.rank}, ADP ${p.adp}, gap ${p.gap}`));
  }
  process.exitCode =
    report.errors.length || report.missingData.length || report.orphanData.length ? 1 : 0;
}
module.exports = { loadBundledData };
