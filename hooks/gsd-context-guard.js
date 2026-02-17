#!/usr/bin/env node
// Context Window Guard - PostToolUse hook
// Detects approaching context limit and instructs Claude to pause work

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const homeDir = os.homedir();
    const stateFile = path.join(homeDir, '.claude', 'cache', 'gsd-context-state.json');

    // Read cached context state (written by statusline hook)
    if (!fs.existsSync(stateFile)) return;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    // Skip if stale (>60 seconds old)
    if (Date.now() - state.timestamp > 60000) return;

    // Default threshold: 70% real usage (remaining < 30%)
    // Claude Code compresses at 80%, so 70% gives ~10% margin to save state
    let threshold = 30; // remaining_percentage threshold (below = danger)

    // Try to read project config for custom threshold
    const cwd = process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.context && config.context.auto_pause === false) return; // disabled
        if (config.context && config.context.pause_threshold != null) {
          // pause_threshold is "real used %" (e.g., 70), convert to remaining
          threshold = 100 - config.context.pause_threshold;
        }
      } catch (e) {}
    }

    // Check if below threshold
    if (state.remaining_percentage > threshold) return;

    // Check if already warned this session
    const warnFile = path.join(homeDir, '.claude', 'cache', 'gsd-context-warned.json');
    let warned = false;
    if (fs.existsSync(warnFile)) {
      try {
        const w = JSON.parse(fs.readFileSync(warnFile, 'utf8'));
        warned = (w.session_id === state.session_id);
      } catch (e) {}
    }

    // Write warned flag
    fs.writeFileSync(warnFile, JSON.stringify({
      session_id: state.session_id,
      timestamp: Date.now()
    }));

    // Output message to Claude
    if (!warned) {
      // First warning - detailed instructions
      process.stdout.write([
        '<context-window-alert>',
        'CONTEXT WINDOW AT ' + state.raw_used + '% - APPROACHING LIMIT',
        '',
        'You MUST pause work NOW to avoid context compression.',
        '',
        'Do this immediately:',
        '1. If inside a GSD workflow with .planning/ directory:',
        '   - Create .continue-here.md in the current phase directory',
        '   - Include: current_state, completed_work, remaining_work, decisions_made, context, next_action',
        '   - Commit with: node ~/.claude/get-shit-done/bin/gsd-tools.cjs commit "wip: context-pause at [describe position]" --files .planning/phases/*/.continue-here.md',
        '2. If NOT inside a GSD workflow:',
        '   - Summarize what was being done and what remains',
        '3. Then tell the user:',
        '   "Context window is at ' + state.raw_used + '%. Work has been paused to avoid compression.',
        '    Please start a new session and run /gsd:resume-work to continue."',
        '',
        'Do NOT start any new tool calls. Save state and stop.',
        '</context-window-alert>'
      ].join('\n'));
    } else {
      // Repeat warning - urgent
      process.stdout.write([
        '<context-window-alert>',
        'URGENT: Context at ' + state.raw_used + '%. STOP NOW. Save state and tell user to resume in new session.',
        '</context-window-alert>'
      ].join('\n'));
    }
  } catch (e) {
    // Silent fail - never break tool execution
  }
});
