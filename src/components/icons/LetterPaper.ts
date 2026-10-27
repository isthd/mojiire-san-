import { createLucideIcon } from 'lucide-react';

// 便箋のアイコン：罫線の入った紙に、鉛筆で書き込んでいる絵。
export const LetterPaper = createLucideIcon('letter-paper', [
  ['path', { d: 'M14 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5', key: 'sheet' }],
  ['path', { d: 'M7 7h8', key: 'line1' }],
  ['path', { d: 'M7 12h6', key: 'line2' }],
  ['path', { d: 'M7 17h4', key: 'line3' }],
  ['path', { d: 'M21.4 12.6a1.4 1.4 0 0 0-2-2l-5.4 5.4-.8 2.8 2.8-.8z', key: 'pencil' }],
]);
