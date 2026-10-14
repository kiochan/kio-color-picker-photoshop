const { check } = require("./check.js");
/** @param {string | undefined} tag @param {string} version */
function releaseMeta(tag, version) {
  const match =
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:alpha|beta|rc)\.(?:0|[1-9]\d*)))?$/.exec(
      tag || "",
    );
  if (!tag || !match || match.slice(1, 4).join(".") !== version)
    throw Error(`Tag must match version: v${version} or v${version}-beta.1 (alpha/rc supported)`);
  return { tag, version, prerelease: !!match[4] };
}
module.exports = { releaseMeta };
if (require.main === module) console.log(releaseMeta(process.env.GITHUB_REF_NAME, check().version));
