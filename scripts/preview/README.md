# JSX preview environments

The draft branch is `draft/jsx-referral-funnel`. Production stays on `master` and is not deployed by this workflow.

## Build and review any branch

From the chosen clean checkout:

```sh
node scripts/preview/build-jsx.mjs
python3 -m http.server 8770 --bind 127.0.0.1 --directory .preview/jsx
```

Open `http://127.0.0.1:8770/tools/jsx/`. An optional first argument sets the generated output directory. The builder refuses to clear an unrelated nonempty directory. It copies only the public JSX tool, removes production analytics, adds noindex metadata and robots rules, and includes a draft banner with Reset walkthrough. External JSX links remain real. Preview events stay in the page's bounded `window.JSXPreviewEvents` buffer and disappear on reload.

Pushes to `draft/jsx-*` and JSX pull requests build a downloadable preview artifact automatically in GitHub Actions. This workflow has read-only repository access and does **not** deploy to GitHub Pages, update `master`, or automatically refresh the hosted preview URL.

## Hosted review copy

The current owner-private Sites environment is:

https://john-ta-jsx-referral-preview.john-ta-8439.chatgpt.site

It is a separate hosted copy, not a deployment of john-ta.com. It requires the owner's ChatGPT account. Its local checkout is the sibling `jsx-funnel-hosted-preview` directory. Preserve that checkout's `.openai/hosting.json` identity (`appgprj_6ad82a11a4fc81919a42a84aa367b8a4`). Never put that hosting manifest in the production site root.

To refresh it, commit the draft changes first, run the builder with `../jsx-funnel-hosted-preview/dist`, then use the Sites source/packaging workflow and private deployment operation on the existing hosting project. Each generated copy includes `preview-build.json` with its source commit and dirty state. Hosted refreshes are explicit; GitHub artifact builds are automatic.

To try another experiment independently, branch from current production into another `draft/jsx-*` branch, bring over these preview scripts/workflow if they have not been merged, then build a distinct output directory. A separate hosted URL requires a separate Sites project; reuse the existing project to replace this review copy.

## Validation

```sh
node --test scripts/preview/*.test.mjs
node --test tests/analytics.test.cjs tools/jsx/tests/*.test.cjs
```

The JSX DOM tests need the repository's jsdom development dependency. Publishing production remains a separate, explicitly requested action after review.
