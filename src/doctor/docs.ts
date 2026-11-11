export function robotDocs(): string {
	return `# stepdown-rule doctor — agent handbook

Read-only by default. Never mutates unless --fix is passed.
Exit codes: 0 healthy, 1 findings, 2 partial fix, 3 fix failed/rolled back, 4 refused unsafe, 5 concurrency lost, 6 online required, 64 usage, 66 no input, 73 cannot create output, 74 I/O error.

Commands:
  stepdown-rule doctor                      diagnose (read-only)
  stepdown-rule doctor --fix                repair with backups
  stepdown-rule doctor --dry-run --fix      print plan, no execution
  stepdown-rule doctor --explain <id>       expand one finding
  stepdown-rule doctor undo <run-id|latest> restore from backup
  stepdown-rule doctor capabilities --json  contract + detectors + fixers
  stepdown-rule doctor health              one-line liveness
  stepdown-rule doctor robot-docs          this text
  stepdown-rule doctor ls                  list runs
  stepdown-rule doctor --robot-triage     mega-command: {summary, findings, actions_planned, recommended_command, capabilities_url}
  stepdown-rule doctor --quick            cheap detectors only
  stepdown-rule doctor --json|--robot     stable schema, stdout data only
  stepdown-rule doctor --online           opt-in network probes
  stepdown-rule doctor --only=<subs,...>  scope detectors
  stepdown-rule doctor gc --before <date> --yes  prune old runs

All diagnostics go to stderr for progress; stdout is data. NO_COLOR=1 disables color.
`;
}
