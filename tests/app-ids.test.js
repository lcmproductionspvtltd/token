'use strict';

/** The apps' store IDs match everywhere they are written (Android, iPhone, Kotlin code, packaging). */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0;
const failures = [];
function check(name, ok) {
  if (ok) passed++;
  else failures.push(name);
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}

for (const [app, id] of [
  ['mobile', 'com.ibill.bquee'],
  ['customer', 'com.bquee.customer'],
]) {
  const gradle = read(`${app}/android/app/build.gradle.kts`);
  check(`${app}: Android namespace is ${id}`, gradle.includes(`namespace = "${id}"`));
  check(`${app}: Android application id is ${id}`, gradle.includes(`applicationId = "${id}"`));
  const dir = `${app}/android/app/src/main/kotlin/${id.replace(/\./g, '/')}`;
  const kt = fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.kt'))
    : [];
  check(`${app}: Kotlin code sits in ${dir}`, kt.includes('MainActivity.kt'));
  check(
    `${app}: every Kotlin file says package ${id}`,
    kt.length > 0 && kt.every((f) => read(`${dir}/${f}`).startsWith(`package ${id}\n`)),
  );
  const ids = [
    ...read(`${app}/ios/Runner.xcodeproj/project.pbxproj`).matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
  ].map((m) => m[1]);
  check(`${app}: iPhone bundle id is ${id}`, ids.length > 0 && ids.every((x) => x === id || x === id + '.RunnerTests'));
}
check(
  'packaging names the Biz app com.ibill.bquee',
  read('scripts/package-apps.sh').includes('BQuee-Biz com.ibill.bquee'),
);

for (const app of ['mobile', 'customer']) {
  const team = read(`${app}/tool/apple_team.txt`).trim();
  const teams = [...read(`${app}/ios/Runner.xcodeproj/project.pbxproj`).matchAll(/DEVELOPMENT_TEAM = ([^;]+);/g)].map(
    (m) => m[1],
  );
  check(
    `${app}: every iPhone build setting signs with the Apple team in tool/apple_team.txt (${team})`,
    teams.length === 3 && teams.every((t) => t === team),
  );
}

// Both apps ship as 1.0.0, build 2 (build 1 was replaced at Apple); the build number only goes up.
const versionOf = (app) => (read(`${app}/pubspec.yaml`).match(/^version: (\S+)$/m) || [])[1];
check('BQuee Biz is version 1.0.0 build 3', versionOf('mobile') === '1.0.0+3');
check('BQuee customer app is version 1.0.0 build 3', versionOf('customer') === '1.0.0+3');

// Hosting is the own server (bquee.com); the old Render set-up is gone.
check('no render.yaml', !fs.existsSync(path.join(ROOT, 'render.yaml')));
check(
  'the server reads no RENDER_ settings',
  !/RENDER/.test(read('src/config.js') + read('src/routes/auth.js') + read('.env.example')),
);

console.log(`App IDs: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
