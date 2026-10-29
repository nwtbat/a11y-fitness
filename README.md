# @nwtbat/a11y-fitness

Accessibility fitness functions for Playwright.

## What it does

The package has four parts:

1. **Scan fixture.** The fixture `a11y` runs axe on a page or on a part of a page.
2. **Baseline.** The file `a11y-baseline.json` records the known violations. A new violation
   makes the test fail. A known violation does not.
3. **Keyboard helpers.** Four helpers test the Tab order, the visible focus, focus traps, and
   dialogs.
4. **Report.** A Playwright reporter writes `report.md` and `report.json`.

The scans use the WCAG 2.2 rules of level A and level AA. The axe tags are `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, and `wcag22aa`.

## Install

The package needs Node.js 20 or later, `@playwright/test` 1.48 or later, and
`@axe-core/playwright` 4.10 or later.

1. Install the package and axe:

   ```sh
   npm install --save-dev "github:nwtbat/a11y-fitness#v0.1.0" @axe-core/playwright
   ```

2. Make sure that the project has `@playwright/test`.

The `prepare` script of the package builds the package during the install.

**Note:** pnpm 10 and later does not run the `prepare` script of a git dependency until you
allow the package. If you use pnpm, add the package to `pnpm.onlyBuiltDependencies` in
`package.json`:

```json
"pnpm": {
  "onlyBuiltDependencies": ["@nwtbat/a11y-fitness"]
}
```

## Write a scan test

Import the test object from `@nwtbat/a11y-fitness/test`. Each test then gets the fixture `a11y`.

```ts
import { test } from '@nwtbat/a11y-fitness/test';

test('event page', async ({ page, a11y }) => {
  await page.goto('/events/1');
  await a11y.scan('event page');
  await page.getByRole('button', { name: 'Buy' }).click();
  await a11y.scan('buy dialog', { include: '[role=dialog]' });
});
```

- Give each scan a name that is unique in its Playwright project.
- Use the options `include`, `exclude`, and `disableRules` to set the scope of a scan.
- Give a reason for each rule in `disableRules`, for example
  `{ disableRules: { 'color-contrast': 'The brand color is under review.' } }`. The report
  shows the reason.
- Scan each state of the page: the page itself, dialogs, empty states, and error states.

The fixture keys each result by the scan name and the Playwright project. Thus each viewport
has its own results.

## Add the reporter

Add the reporter to `playwright.config.ts`:

```ts
reporter: [["list"], ["@nwtbat/a11y-fitness/reporter", { outputDir: "a11y-report" }]],
```

The reporter writes `a11y-report/report.md` and `a11y-report/report.json`.

## Adopt the package in a project that has violations

Do these steps one time, when the project adopts the package.

1. Run the Playwright tests. The reporter writes `a11y-report/report.json`.
2. Run `npx a11y-fitness baseline init`.
3. Commit `a11y-baseline.json`.

After these steps, the tests fail only for new violations.

## Baseline commands

All commands read and write `a11y-baseline.json` by default. To use a different file, set
`--baseline <file>` or the environment variable `A11Y_BASELINE`.

| Command | What it does |
|---|---|
| `baseline init` | Writes the baseline from the scans in the report. |
| `baseline prune` | Removes the fixed elements from the baseline. It never adds an entry. |
| `baseline accept <rule>` | Adds one element to the baseline, with a reason. |
| `baseline check` | Compares the baseline with the baseline of the target branch. |

Examples:

```sh
npx a11y-fitness baseline init
npx a11y-fitness baseline prune
npx a11y-fitness baseline accept color-contrast --page "event page" --project desktop \
  --target ".price" --reason "The brand team owns this color. Ticket DES-12."
npx a11y-fitness baseline check --against /tmp/a11y-base.json
```

Use the baseline as follows:

- If a scan finds a new violation, correct the page.
- If you cannot correct a violation, run `baseline accept` with a reason. A reviewer reads the
  reason in the pull request.
- If the report shows fixed elements, run `baseline prune`. Then commit the baseline.

`baseline check` fails when an entry is new or has a larger count without a reason. If the
`--against` file does not exist, the target branch has no baseline, and the check passes.

## Keyboard helpers

Import the helpers from `@nwtbat/a11y-fitness`.

| Helper | What it checks |
|---|---|
| `expectTabOrder(page, locators)` | The Tab key moves the focus through the locators in the given order. |
| `expectFocusVisible(locator)` | The focused element has an outline, a box shadow, a border change, a background change, or a text decoration. |
| `expectNoFocusTrap(region)` | The Tab key and Shift+Tab move the focus out of the region. |
| `expectDialogKeyboard(opener, dialog)` | The focus moves into the dialog. Escape closes the dialog. The focus goes back to the opener. |

## CI

Add this step to the CI job, after the Playwright tests:

```yaml
      - name: The baseline does not grow without a reason
        run: |
          BASE="${{ github.base_ref || 'main' }}"
          git fetch --depth=1 origin "$BASE"
          if git cat-file -e "origin/$BASE:a11y-baseline.json" 2>/dev/null; then
            git show "origin/$BASE:a11y-baseline.json" > /tmp/a11y-base.json
          else
            rm -f /tmp/a11y-base.json
          fi
          npx a11y-fitness baseline check --against /tmp/a11y-base.json
```

The step tells two cases apart:

- If the step cannot fetch the target branch, `git fetch` fails, and the step fails.
- If the target branch has no `a11y-baseline.json`, the step removes `/tmp/a11y-base.json`.
  Then the check passes.

Do not use `pull_request_target` for this job. On a protected branch, make the job a required
status check.

## License

MIT. Refer to `LICENSE`.
