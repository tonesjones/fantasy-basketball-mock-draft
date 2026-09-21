// vacated-usage.js — curated vacated-usage gainers for high-ADP movers (phase 2).
//
// vacatedGainers: who on the PREVIOUS team (teamPrev) likely gains touches/minutes
// when the mover leaves. Curated from depth-chart / known rotation notes +
// positional overlap — NOT a Basketball Monster scrape and NOT published tables.
// See docs/vacated-usage.md.
//
// Scope: ~22 movers with Yahoo ADP < 100 (covers all ADP < 80 plus notable
// mid-round movers). Max 2–3 gainers each. Advisory only.
var VACATED_USAGE = {
  "Giannis Antetokounmpo": {
    vacatedGainers: [
      { name: "Myles Turner", reason: "lead big; paint/blocks usage" },
      { name: "Kyle Kuzma", reason: "forward scoring vacuum" },
      { name: "AJ Green", reason: "wing shooting minutes" }
    ]
  },
  "Kawhi Leonard": {
    vacatedGainers: [
      { name: "Darius Garland", reason: "on-ball creation" },
      { name: "Derrick Jones Jr.", reason: "wing minutes" }
    ]
  },
  "LaMelo Ball": {
    vacatedGainers: [
      { name: "Brandon Miller", reason: "primary creation" },
      { name: "Kon Knueppel", reason: "guard/wing touches" }
    ]
  },
  "Jaylen Brown": {
    vacatedGainers: [
      { name: "Derrick White", reason: "usage / on-ball" },
      { name: "Payton Pritchard", reason: "guard minutes" },
      { name: "Sam Hauser", reason: "wing threes" }
    ]
  },
  "LeBron James": {
    vacatedGainers: [
      { name: "Austin Reaves", reason: "creation / usage" },
      { name: "Walker Kessler", reason: "frontcourt minutes" }
    ]
  },
  "Tyler Herro": {
    vacatedGainers: [
      { name: "Andrew Wiggins", reason: "wing scoring" },
      { name: "Davion Mitchell", reason: "guard minutes" }
    ]
  },
  "Julius Randle": {
    vacatedGainers: [
      { name: "Jaden McDaniels", reason: "forward minutes/usage" },
      { name: "Donte DiVincenzo", reason: "shot volume" }
    ]
  },
  "Naz Reid": {
    vacatedGainers: [
      { name: "Rudy Gobert", reason: "center minutes" },
      { name: "Jaden McDaniels", reason: "PF minutes" }
    ]
  },
  "Ivica Zubac": {
    vacatedGainers: [
      { name: "Brook Lopez", reason: "center minutes/rebounds" }
    ]
  },
  "Damian Lillard": {
    vacatedGainers: [
      { name: "Ryan Rollins", reason: "PG usage" },
      { name: "Kevin Porter Jr.", reason: "on-ball minutes" },
      { name: "AJ Green", reason: "shooting guard minutes" }
    ]
  },
  "Brandon Ingram": {
    vacatedGainers: [
      { name: "RJ Barrett", reason: "wing scoring" },
      { name: "Immanuel Quickley", reason: "creation" },
      { name: "Scottie Barnes", reason: "usage consolidation" }
    ]
  },
  "Kel'el Ware": {
    vacatedGainers: [
      { name: "Bam Adebayo", reason: "center minutes" },
      { name: "Nikola Jovic", reason: "frontcourt minutes" }
    ]
  },
  "Paul George": {
    vacatedGainers: [
      { name: "Tyrese Maxey", reason: "usage / creation" },
      { name: "VJ Edgecombe", reason: "wing minutes" }
    ]
  },
  "Al Horford": {
    vacatedGainers: [
      { name: "Neemias Queta", reason: "center minutes" },
      { name: "Nikola Vucevic", reason: "big-man touches" }
    ]
  },
  "Coby White": {
    vacatedGainers: [
      { name: "Josh Giddey", reason: "guard creation" },
      { name: "Tre Jones", reason: "PG minutes" },
      { name: "Matas Buzelis", reason: "shot opportunities" }
    ]
  },
  "Luke Kornet": {
    vacatedGainers: [
      { name: "Neemias Queta", reason: "center minutes" },
      { name: "Nikola Vucevic", reason: "frontcourt load" }
    ]
  },
  "De'Andre Hunter": {
    vacatedGainers: [
      { name: "Evan Mobley", reason: "forward usage" },
      { name: "Sam Merrill", reason: "wing threes" }
    ]
  },
  "Ja Morant": {
    vacatedGainers: [
      { name: "Scotty Pippen Jr.", reason: "PG usage" },
      { name: "GG Jackson", reason: "creation / scoring" },
      { name: "Jaylen Wells", reason: "wing minutes" }
    ]
  },
  "Andre Drummond": {
    vacatedGainers: [
      { name: "Joel Embiid", reason: "center minutes consolidation" },
      { name: "Adem Bona", reason: "backup C minutes" }
    ]
  },
  "Norman Powell": {
    vacatedGainers: [
      { name: "Andrew Wiggins", reason: "wing scoring" },
      { name: "Davion Mitchell", reason: "guard minutes" }
    ]
  },
  "Nic Claxton": {
    vacatedGainers: [
      { name: "Day'Ron Sharpe", reason: "center minutes" },
      { name: "Michael Porter Jr.", reason: "cleaner looks" }
    ]
  },
  "Miles Bridges": {
    vacatedGainers: [
      { name: "Brandon Miller", reason: "forward usage" },
      { name: "Kon Knueppel", reason: "wing touches" }
    ]
  }
};
(function () {
  if (typeof PDATA === "undefined") return;
  Object.keys(VACATED_USAGE).forEach(function (n) {
    if (!Object.prototype.hasOwnProperty.call(PDATA, n)) return;
    var v = VACATED_USAGE[n];
    if (v && v.vacatedGainers) PDATA[n].vacatedGainers = v.vacatedGainers;
  });
})();
