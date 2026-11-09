// The overlay is drawn by a separate PowerShell/C# process, so the language
// has to travel with the settings. This suite covers the resolution rules and
// every string table on this side of that boundary; the rendered English
// surface is covered by the native overlay suites.
import assert from 'node:assert/strict';
import {
  OVERLAY_LANGUAGES, DEFAULT_INDICATOR_TEXT_ZH, DEFAULT_INDICATOR_TEXT_EN,
  languageTag, resolveOverlayLanguage, indicatorTextFor, actionLabelFor, previewProgress, detectUiLanguage
} from '../mcp/i18n.mjs';
import { actionLabel } from '../mcp/activity.mjs';
import { DEFAULT_SETTINGS, normalizeSettings, repairStaleSettings } from '../mcp/settings.mjs';
import { summaryInput } from '../mcp/progress-summary.mjs';
import { PREVIEW_PROGRESS, TakeoverControl } from '../mcp/takeover.mjs';

// 'auto' follows DSH; an unknown language falls back to the historical Chinese
// overlay, so a caller that passes nothing behaves as before.
assert.equal(resolveOverlayLanguage('auto', 'en-US'), 'en');
assert.equal(resolveOverlayLanguage('auto', 'zh-CN'), 'zh');
assert.equal(resolveOverlayLanguage('auto', 'fr'), 'en');
assert.equal(resolveOverlayLanguage('auto', undefined), 'zh');
assert.equal(resolveOverlayLanguage('zh', 'en-US'), 'zh', 'An explicit choice wins');
assert.equal(resolveOverlayLanguage('en', 'zh-CN'), 'en', 'An explicit choice wins');
assert.equal(languageTag('ZH-hans'), 'zh');
assert.equal(languageTag(''), null);
assert.equal(languageTag(7), null);
assert.deepEqual([...OVERLAY_LANGUAGES], ['auto', 'zh', 'en']);

// The saved banner sentence is Chinese; an English interface says it in English.
assert.equal(indicatorTextFor(DEFAULT_INDICATOR_TEXT_ZH, 'en'), DEFAULT_INDICATOR_TEXT_EN);
assert.equal(indicatorTextFor('', 'en'), DEFAULT_INDICATOR_TEXT_EN);
assert.equal(indicatorTextFor('My own words', 'en'), 'My own words');
assert.equal(indicatorTextFor(DEFAULT_INDICATOR_TEXT_ZH, 'zh'), DEFAULT_INDICATOR_TEXT_ZH);
assert.equal(indicatorTextFor('', 'zh'), DEFAULT_INDICATOR_TEXT_ZH);

// The setting is validated and repaired like every other choice.
assert.equal(normalizeSettings({}).overlayLanguage, 'auto');
assert.equal(normalizeSettings({ overlayLanguage: 'en' }).overlayLanguage, 'en');
assert.throws(() => normalizeSettings({ overlayLanguage: 'de' }), /overlayLanguage/);
assert.deepEqual(repairStaleSettings({ overlayLanguage: 'de' }).value, {}, 'A stale language falls back to the default');

// Action names are the words the overlay shows for a step.
const en = (name, args = {}) => actionLabelFor(name, args, 'en', value => String(value).replace(/^(?:mcp__wincu__)?windows_computer_use_/, ''));
const zh = (name, args = {}) => actionLabel(name, args);
assert.equal(en('windows_computer_use_scroll', {}), 'scroll the window');
assert.equal(en('windows_computer_use_scroll', { browserTab: 't1a2b:5' }), 'scroll the page');
assert.equal(en('mcp__wincu__windows_computer_use_click', {}), 'click');
assert.equal(en('windows_computer_use_set_value', { elementId: 'new-tab' }), 'open a new tab');
assert.equal(en('windows_computer_use_set_value', { elementId: 't1:address' }), 'open a URL');
assert.equal(en('windows_computer_use_batch', { steps: [{ action: 'scroll' }, { action: 'screenshot' }] }), 'run 2 actions: scroll the window, take a screenshot');
assert.equal(en('windows_computer_use_web_search', {}), 'search the web');
assert.equal(en('unknown_tool', {}), '');
assert.equal(zh('windows_computer_use_scroll', {}), '滚动窗口');
assert.equal(zh('windows_computer_use_scroll', { browserTab: 't:1' }), '滚动页面');
assert.equal(zh('windows_computer_use_batch', { steps: [{ action: 'scroll' }] }), '连续执行 1 个操作：滚动窗口');

// The preview shown by "Open overlay to adjust" reads like the real overlay.
assert.equal(previewProgress('en').steps[0].actions[0].label, 'open a new tab');
assert.equal(previewProgress('en').action, 'scroll the page');
assert.equal(previewProgress('zh').action, '滚动页面');
assert.equal(PREVIEW_PROGRESS.action, '滚动页面', 'The exported preview keeps its Chinese default');

// The optional AI summary is written in the overlay language.
const progress = { status: 'done', step: 2, steps: [
  { step: 1, actions: [{ label: 'open a new tab', state: 'done' }], reasoning: 'Starting.', reply: '' },
  { step: 2, actions: [{ label: 'scroll the page', state: 'running' }], reasoning: 'Reading on.', reply: 'Done.' }
] };
const english = summaryInput(progress, 2400, 'en');
assert.match(english, /Task status: completed/);
assert.match(english, /Step 2: scroll the page \(running\)/);
assert.match(english, /Reply to the user: Done\./);
const chinese = summaryInput({ ...progress, steps: progress.steps.map(step => ({
  ...step, actions: step.actions.map(action => ({ ...action, label: action.label === 'open a new tab' ? '打开新标签页' : '滚动页面' }))
})) });
assert.match(chinese, /任务状态：已完成/);
assert.match(chinese, /第 2 步：滚动页面（进行中）/);
assert.match(chinese, /给用户的回复：Done\./);

// The adapter reads DSH's language from the locale service or the locale
// settings namespace, and falls back to the operating system.
assert.equal(detectUiLanguage({ get: () => ({ getSnapshot: () => ({ active: 'en' }) }) }), 'en');
assert.equal(detectUiLanguage({ get: () => ({ getLocale: () => ({ active: 'zh-CN' }) }) }), 'zh-CN');
assert.equal(detectUiLanguage({}, { describe: () => [{ ns: 'locale', value: { preference: 'en' } }] }), 'en');
assert.equal(detectUiLanguage({}, { describe: () => ({ namespaces: [{ ns: 'locale', value: {} }] }) }), Intl.DateTimeFormat().resolvedOptions().locale, 'No preference falls back to the system language');
assert.equal(detectUiLanguage({ get: () => ({ getSnapshot: () => ({ active: '' }) }) }, { describe: () => { throw Error('no forms'); } }), Intl.DateTimeFormat().resolvedOptions().locale);
assert.equal(typeof detectUiLanguage({}), 'string');

// The step history the overlay draws comes from the adapter: with an English
// language the action names are English, and the Chinese path is unchanged.
{
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { installActivity } = await import('../mcp/activity.mjs');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wcu-overlay-language-'));
  const file = path.join(dir, 'activity.json');
  const handlers = {}, disposers = [];
  const ctx = { on: (name, fn) => { handlers[name] = fn; }, effect: fn => disposers.push(fn()), logger: { error: error => { throw error; } } };
  installActivity(ctx, file, { getLanguage: () => 'en' });
  const agent = { session: { id: 'english' }, phase: { kind: 'running', turn: 1 } };
  await handlers['tools/execute']({ name: 'mcp__wincu__windows_computer_use_click', arguments: { x: 10, y: 10 }, agent, signal: new AbortController().signal }, async () => true);
  await handlers['tools/execute']({ name: 'mcp__wincu__windows_computer_use_scroll', arguments: { browserTab: 't1a2b:5' }, agent, signal: new AbortController().signal }, async () => true);
  const activity = JSON.parse(await readFile(file, 'utf8'));
  const labels = activity.progress.steps.at(-1).actions.map(action => action.label);
  assert.deepEqual(labels, ['click', 'scroll the page']);
  for (const dispose of disposers.splice(0)) dispose?.();
}

// The helper is told the language in every command; 'auto' reads the DSH one.
const previous = process.env.WCU_UI_LANGUAGE;
try {
  process.env.WCU_UI_LANGUAGE = 'en-US';
  const auto = new TakeoverControl({ testMode: true, config: { ...DEFAULT_SETTINGS, overlayLanguage: 'auto' } });
  assert.equal(auto.language, 'en');
  assert.equal(auto.commandConfig().language, 'en');
  assert.equal(auto.previewProgress().action, 'scroll the page');
  const french = new TakeoverControl({ testMode: true, config: { ...DEFAULT_SETTINGS, overlayLanguage: 'auto' } });
  process.env.WCU_UI_LANGUAGE = 'fr';
  assert.equal(french.language, 'en', 'Languages without overlay copy use English');
  process.env.WCU_UI_LANGUAGE = 'zh-CN';
  assert.equal(french.language, 'zh');
  const forced = new TakeoverControl({ testMode: true, config: { ...DEFAULT_SETTINGS, overlayLanguage: 'en' } });
  process.env.WCU_UI_LANGUAGE = 'zh-CN';
  assert.equal(forced.language, 'en', 'The explicit setting wins over the interface language');
  delete process.env.WCU_UI_LANGUAGE;
  const legacy = new TakeoverControl({ testMode: true, config: { ...DEFAULT_SETTINGS } });
  assert.equal(legacy.language, 'zh', 'With nothing known the overlay keeps its Chinese default');
} finally {
  if (previous === undefined) delete process.env.WCU_UI_LANGUAGE; else process.env.WCU_UI_LANGUAGE = previous;
}

console.log(JSON.stringify({ passed: true, languages: OVERLAY_LANGUAGES.length, autoFollowsDsh: true, explicitWins: true, englishStrings: true, chineseUnchanged: true }));
