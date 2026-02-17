#!/usr/bin/env node
// PreCompact Guard - fires before context compression
// Safety net: if PostToolUse warnings were missed, this catches it

process.stdout.write([
  '<context-window-emergency>',
  'CONTEXT COMPRESSION IMMINENT.',
  'If you have unsaved work state, save it NOW.',
  'Tell the user to start a new session and run /gsd:resume-work.',
  '</context-window-emergency>'
].join('\n'));
