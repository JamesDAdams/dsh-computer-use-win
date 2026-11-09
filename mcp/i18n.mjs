// On-screen copy for the takeover banner, the pointer tag, the reasoning and
// progress overlay, and the plain-language action names those surfaces show.
//
// The settings page and DSH itself are localized by DSH's locale service, but
// the overlay is drawn by a separate PowerShell/C# process that never sees it.
// The language therefore has to travel with the settings: `overlayLanguage`
// ('auto' | 'zh' | 'en') is the user's choice, `WCU_UI_LANGUAGE` is the
// language the DSH interface currently uses (the adapter reads it from DSH's
// locale preference), and a settings change reconnects the server so the
// helper process is told the new language.
//
// 'auto' with nothing known keeps the historical Chinese overlay, so existing
// installations and every caller that does not pass a language behave exactly
// as before.

export const OVERLAY_LANGUAGES = Object.freeze(['auto', 'zh', 'en']);

// The banner text DSH saves while its interface is Chinese. A user who never
// edited the field still shows the English sentence in an English interface.
export const DEFAULT_INDICATOR_TEXT_ZH = 'DSH 正在控制电脑';
export const DEFAULT_INDICATOR_TEXT_EN = 'DSH is controlling the computer';

// 'zh-CN', 'zh-Hans' and 'zh' are Chinese; every other language DSH ships uses
// the English overlay, because the overlay itself exists only in these two.
export function languageTag(value) {
  if (typeof value !== 'string') return null;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  if (!primary) return null;
  if (primary === 'zh') return 'zh';
  if (/^[a-z]{2,8}$/.test(primary)) return 'en';
  return null;
}

// Resolve what the overlay should draw. An explicit choice wins, then the DSH
// interface language, then the historical Chinese default.
export function resolveOverlayLanguage(setting, uiLanguage) {
  if (setting === 'zh' || setting === 'en') return setting;
  return languageTag(uiLanguage) ?? 'zh';
}

export function indicatorTextFor(text, language) {
  const value = typeof text === 'string' ? text : '';
  if (language !== 'en') return value || DEFAULT_INDICATOR_TEXT_ZH;
  // Both the untouched saved default and an empty value mean "say it in English".
  if (!value.trim() || value === DEFAULT_INDICATOR_TEXT_ZH) return DEFAULT_INDICATOR_TEXT_EN;
  return value;
}

// Which language the DSH interface is in, as far as the host half can tell.
// The overlay copy is drawn by a separate process that never sees DSH's locale
// service, so the adapter resolves it here and passes it along. Order: a locale
// service mounted on this context, then DSH's own language preference (the same
// value DSH Desktop reads from Settings > General > Language), then the
// operating system's interface language, then nothing at all.
export function detectUiLanguage(ctx, settingsService) {
  try {
    const locale = typeof ctx?.get === 'function' ? ctx.get('locale') : ctx?.locale;
    const active = locale?.getSnapshot?.()?.active ?? locale?.getLocale?.()?.active;
    if (typeof active === 'string' && languageTag(active)) return active;
  } catch {}
  try {
    const rows = settingsService?.describe?.();
    const list = Array.isArray(rows) ? rows : Array.isArray(rows?.namespaces) ? rows.namespaces : [];
    const row = list.find(item => item?.ns === 'locale');
    const preference = row?.value?.preference;
    if (typeof preference === 'string' && languageTag(preference)) return preference;
  } catch {}
  try {
    const system = Intl.DateTimeFormat().resolvedOptions().locale;
    if (languageTag(system)) return system;
  } catch {}
  return '';
}

// Page form first, window form second: a backend element id routes inside a
// page, and calls without browserTab are desktop calls.
const ACTION_LABELS = Object.freeze({
  snapshot: [['读取页面内容', 'read the page'], ['读取窗口内容', 'read the window']],
  accessibility_tree: [['读取界面结构', 'read the interface']],
  list_windows: [['查找浏览器或窗口', 'find the browser or a window']],
  find: [['查找页面元素', 'find a page element'], ['查找界面元素', 'find an interface element']],
  element_info: [['查看元素信息', 'inspect an element']],
  click: [['点击页面元素', 'click a page element'], ['点击', 'click']],
  double_click: [['双击', 'double-click']],
  move: [['移动鼠标', 'move the pointer']],
  drag: [['拖动', 'drag']],
  scroll: [['滚动页面', 'scroll the page'], ['滚动窗口', 'scroll the window']],
  type_text: [['输入文字', 'type text']],
  keypress: [['按键', 'press keys']],
  focus: [['切换焦点', 'move the focus']],
  invoke: [['操作控件', 'operate a control']],
  activate_window: [['切换到窗口', 'switch windows']],
  wait: [['等待', 'wait']],
  ocr: [['识别屏幕文字', 'read screen text']],
  screenshot: [['截图查看页面', 'take a page screenshot'], ['截图查看屏幕', 'take a screenshot']],
  wait_for: [['等待页面变化', 'wait for the page'], ['等待界面变化', 'wait for the interface']],
  close_window: [['关闭窗口', 'close the window']],
  move_window: [['移动窗口', 'move the window']],
  launch_app: [['打开应用或网页', 'open an app or web page']],
  // DSH's own tools that often run inside a computer-use turn.
  read_image: [['查看截图', 'view a screenshot']],
  web_search: [['搜索网页', 'search the web']],
  web_fetch: [['读取网页', 'read a web page']]
});

const pick = (pair, language) => (language === 'en' ? pair[1] : pair[0]);

// Names the overlay shows for one call. They come from the tool name and the
// shape of the call, never from its values: no typed text, URLs or coordinates.
export function actionLabelFor(tool, args = {}, language = 'zh', shortName = name => name) {
  const name = shortName(tool);
  if (name === 'batch') {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const kinds = [...new Set(steps
      .map(step => actionLabelFor(step?.action, { ...asObject(step?.arguments), browserTab: args.browserTab }, language, shortName))
      .filter(Boolean))];
    if (language === 'en') {
      return `run ${steps.length} action${steps.length === 1 ? '' : 's'}` +
        (kinds.length ? ': ' + kinds.slice(0, 2).join(', ') + (kinds.length > 2 ? ' and more' : '') : '');
    }
    return `连续执行 ${steps.length} 个操作` +
      (kinds.length ? '：' + kinds.slice(0, 2).join('、') + (kinds.length > 2 ? ' 等' : '') : '');
  }
  if (name === 'set_value') {
    const id = String(args.elementId ?? '');
    if (/(?:^|:)new-tab$/.test(id)) return language === 'en' ? 'open a new tab' : '打开新标签页';
    if (/:address$/.test(id)) return language === 'en' ? 'open a URL' : '打开网址';
    if (/:connect$/.test(id)) return language === 'en' ? 'connect the browser' : '连接浏览器';
    return language === 'en' ? 'fill in or choose a value' : '填写或选择内容';
  }
  const labels = ACTION_LABELS[name];
  if (!labels) return '';
  const pair = labels.length > 1 && !args.browserTab ? labels[1] : labels[0];
  return pick(pair, language);
}

function asObject(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return {}; } }
  return value && typeof value === 'object' ? value : {};
}

// "Open overlay to adjust" shows a fixed two-step example; it has to read in
// the same language the real overlay will use.
export function previewProgress(language = 'zh') {
  if (language === 'en') {
    return {
      step: 2, status: 'acting', tool: 'scroll', action: 'scroll the page',
      steps: [
        { step: 1, actions: [{ label: 'open a new tab', state: 'done' }], reasoning: 'Reasoning text from DSH appears here step by step, exactly as it does in the conversation.', reply: '' },
        { step: 2, actions: [{ label: 'scroll the page', state: 'running' }], reasoning: 'Long replies scroll; once you are back at the bottom the overlay follows new output again.', reply: '' }
      ]
    };
  }
  return {
    step: 2, status: 'acting', tool: 'scroll', action: '滚动页面',
    steps: [
      { step: 1, actions: [{ label: '打开新标签页', state: 'done' }], reasoning: '这里按步骤显示 DSH 的思考文字，和对话里看到的一致。', reply: '' },
      { step: 2, actions: [{ label: '滚动页面', state: 'running' }], reasoning: '正文较长时可以滚动查看；回到底部后继续跟随新输出。', reply: '' }
    ]
  };
}
