#!/usr/bin/env node
/* Delete a branch's Cloudflare Pages preview deployments once its PR closes.

   Every branch push builds a preview in each Pages project, and Cloudflare keeps
   them (and the <branch>.<project>.pages.dev alias) after the branch is gone.
   This lists each project's *preview* deployments, keeps those built from the
   given branch, and deletes them. Production deployments are never touched.

   Usage:
     CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
       node scripts/cleanup-pages-previews.js <branch> [--dry-run]

   Projects: PAGES_PROJECTS (comma-separated) or the defaults below.
   The token needs the "Cloudflare Pages: Edit" permission.
   API: https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/ */
"use strict";

var DEFAULT_PROJECTS = ["tony-draft-lab", "tony-draft-lab-yahoo", "tony-draft-lab-preview"];
var PROTECTED_BRANCHES = ["main"];
var PER_PAGE = 25;

function branchOf(d) {
  return d && d.deployment_trigger && d.deployment_trigger.metadata ? d.deployment_trigger.metadata.branch : undefined;
}

/* Only preview deployments built from exactly this branch. */
function matchingDeployments(deployments, branch) {
  return deployments.filter(function (d) {
    return d.environment === "preview" && branchOf(d) === branch;
  });
}

async function api(fetchImpl, token, method, url) {
  var res = await fetchImpl(url, { method: method, headers: { Authorization: "Bearer " + token } });
  var body = await res.json().catch(function () {
    return {};
  });
  if (!res.ok || body.success === false) {
    var msg = (body.errors || [])
      .map(function (e) {
        return e.message;
      })
      .join("; ");
    throw new Error(method + " " + url + " failed: " + res.status + (msg ? " " + msg : ""));
  }
  return body;
}

async function listPreviews(opts, project) {
  var all = [];
  for (var page = 1; ; page++) {
    var url =
      opts.base +
      "/accounts/" +
      opts.accountId +
      "/pages/projects/" +
      encodeURIComponent(project) +
      "/deployments?env=preview&per_page=" +
      PER_PAGE +
      "&page=" +
      page;
    var body = await api(opts.fetch, opts.token, "GET", url);
    var batch = body.result || [];
    all = all.concat(batch);
    if (batch.length < PER_PAGE) return all;
  }
}

async function cleanup(opts) {
  if (!opts.branch) throw new Error("branch is required");
  if (PROTECTED_BRANCHES.indexOf(opts.branch) !== -1) throw new Error("refusing to clean protected branch " + opts.branch);
  var log = opts.log || console.log;
  var summary = {};
  for (var i = 0; i < opts.projects.length; i++) {
    var project = opts.projects[i];
    var targets = matchingDeployments(await listPreviews(opts, project), opts.branch);
    summary[project] = targets.length;
    for (var j = 0; j < targets.length; j++) {
      var d = targets[j];
      if (opts.dryRun) {
        log("would delete " + project + " " + d.id + " (" + opts.branch + ")");
        continue;
      }
      var url =
        opts.base +
        "/accounts/" +
        opts.accountId +
        "/pages/projects/" +
        encodeURIComponent(project) +
        "/deployments/" +
        d.id +
        "?force=true";
      await api(opts.fetch, opts.token, "DELETE", url);
      log("deleted " + project + " " + d.id + " (" + opts.branch + ")");
    }
  }
  return summary;
}

module.exports = { cleanup: cleanup, matchingDeployments: matchingDeployments, DEFAULT_PROJECTS: DEFAULT_PROJECTS };

if (require.main === module) {
  var args = process.argv.slice(2);
  var branch = args.filter(function (a) {
    return a.indexOf("--") !== 0;
  })[0];
  var token = process.env.CLOUDFLARE_API_TOKEN,
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!branch || !token || !accountId) {
    console.error("usage: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/cleanup-pages-previews.js <branch> [--dry-run]");
    process.exit(2);
  }
  cleanup({
    branch: branch,
    token: token,
    accountId: accountId,
    projects: process.env.PAGES_PROJECTS ? process.env.PAGES_PROJECTS.split(",").map(function (s) {
      return s.trim();
    }) : DEFAULT_PROJECTS,
    dryRun: args.indexOf("--dry-run") !== -1,
    fetch: fetch,
    base: "https://api.cloudflare.com/client/v4",
  }).then(
    function (summary) {
      Object.keys(summary).forEach(function (p) {
        console.log(p + ": " + summary[p] + " preview deployment(s) for " + branch);
      });
    },
    function (e) {
      console.error(e.message);
      process.exit(1);
    }
  );
}
