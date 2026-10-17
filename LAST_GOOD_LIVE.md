# Last good live build

| | |
| --- | --- |
| Commit | `9569338` |
| Date | 2026-10-17 |
| Approved by | owner |
| Reason | Mamma Mia hero polish (size + rounded corners + shadow) shipped and confirmed on www.pringlepadel.com |

If `main` ever goes bad, roll back to this commit:

```bash
git checkout main
git reset --hard 9569338          # or: git revert <bad-sha>
git push --force-with-lease origin main
```

Or repoint GitHub Pages to this branch via Settings -> Pages.
