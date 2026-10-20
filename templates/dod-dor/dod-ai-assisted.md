# Definition of Done: AI-assisted and agent-authored changes

> An **addendum**, not a replacement: keep your team's normal DoD and add these lines for any change
> where an AI assistant or coding agent wrote a meaningful part of the code, tests or docs.
> Fork it, delete what your team will not honour, and get explicit agreement on the rest.

## Accountability

- [ ] A named person on the team owns this change and can explain every line of it without the tool open.
- [ ] The PR description says what was generated and what was written or rewritten by hand.
- [ ] The change stays inside the scope of its ticket or brief; anything extra was split out or removed.

## Review

- [ ] Reviewed by a person who did not prompt it, with the same rigour as any other change.
- [ ] The diff is small enough to actually read. Large generated diffs were split before review, not after.
- [ ] Every API, flag, config key and dependency it uses was checked to exist in the version we run.
- [ ] No new dependency was added without the team's usual approval, however convenient the suggestion.

## Tests

- [ ] Generated tests were seen to **fail before the fix** and pass after it.
- [ ] Tests assert behaviour, not the implementation the agent happened to write.
- [ ] Edge cases from the acceptance criteria are covered, not only the ones the tool proposed.

## Safety

- [ ] No secrets, credentials, customer data or personal data were pasted into a prompt or committed.
- [ ] Licences of any substantial copied or generated snippet were checked against our policy.
- [ ] Security-sensitive paths (auth, crypto, permissions, payments, data deletion) had a human-led review.
- [ ] The agent worked on a branch and did not push to the main branch or touch production.

## Learning loop

- [ ] Anything the agent got repeatedly wrong was fed back into `AGENTS.md`, the brief template or the
      team's working agreements, so the next run starts better.
