const assert = require("node:assert/strict");
const { packageWithAdobe } = require("../scripts/package-ccx.js");
async function run() {
  const params = { manifest: "staged/manifest.json", apps: ["PS"], packageDir: "out" };
  let calls = 0,
    created = false;
  const io = { existsSync: () => created, statSync: () => ({ size: 100 }) };
  class AdobeStub {
    constructor(manager, received) {
      assert.equal(manager, null);
      assert.equal(received, params);
    }
    async package() {
      calls++;
      created = true;
      return [{ success: true, host: "PS" }];
    }
  }
  assert.equal(await packageWithAdobe(AdobeStub, params, "out/plugin.ccx", io), "out/plugin.ccx");
  assert.equal(calls, 1);
  await assert.rejects(() => packageWithAdobe(AdobeStub, params, "out/plugin.ccx", io), /stale/);
  assert.equal(calls, 1);
  class Invalid {
    async package() {
      return [{ success: false, error: Error("Invalid manifest") }];
    }
  }
  created = false;
  await assert.rejects(
    () => packageWithAdobe(Invalid, params, "out/plugin.ccx", io),
    /Invalid manifest/,
  );
  class NoOutput {
    async package() {
      return [{ success: true, host: "PS" }];
    }
  }
  await assert.rejects(
    () => packageWithAdobe(NoOutput, params, "out/plugin.ccx", io),
    /did not produce/,
  );
  class WrongHost {
    async package() {
      return [{ success: true, host: "XD" }];
    }
  }
  await assert.rejects(
    () => packageWithAdobe(WrongHost, params, "out/plugin.ccx", io),
    /packaging failed/,
  );
  created = false;
  await assert.rejects(
    () =>
      packageWithAdobe(AdobeStub, params, "out/plugin.ccx", {
        existsSync: () => created,
        statSync: () => ({ size: 0 }),
      }),
    /did not produce/,
  );
  return "Adobe packaging adapter tests passed";
}
module.exports = { run };
if (require.main === module)
  run()
    .then(console.log)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
