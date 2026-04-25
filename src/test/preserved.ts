import { preservedHandle, restoreText } from '../utils/preservedText';

const testPatterns = [
  /API/gi,
  /abc/gi,
];

const text = `PTX 中的 abc 不该会被替换， 如 <PTX_abc123>`;

const 预期 = "PTX 中的 <PTX_moejg6k8_exhagqpl_2> 不该会被替换，如 <PTX_abc123>"
console.log('原始文本:', text);

const preserved = preservedHandle(text, testPatterns, []);
console.log('\n处理后:', preserved.text);
console.log('字典:', Array.from(preserved.dictionary.entries()));

const restored = restoreText(preserved.text, preserved.dictionary);
console.log('\n还原后:', restored);