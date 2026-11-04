// 回答欄に置いた文字枠を、入力後（「完了」時）に欄に合わせる。
import { fitOverflow } from '../lib/fieldFontSize';
import { isRuledText, type TextObject } from '../types/model';
import { measureText } from './describe';

/** 欄からはみ出す文字だけ少し縮める。回答欄の枠でない・手動でサイズを変えた文字はそのまま */
export function fitTextToField(o: TextObject): TextObject {
  const target = o.fieldFontSize;
  if (!target || !o.fieldWidth || !o.fieldHeight || !o.text || isRuledText(o)) return o;
  const verticalField = o.fieldHeight > o.fieldWidth;
  // 欄と違う向きで書いたときは合わせようがないので、基準の大きさのまま
  if (!!o.vertical !== verticalField) return o.fontSize === target ? o : { ...o, fontSize: target };
  const m = measureText({ ...o, fontSize: target });
  const fontSize = o.vertical ? fitOverflow(target, m.height, o.fieldHeight) : fitOverflow(target, m.width, o.fieldWidth);
  return Math.abs(fontSize - o.fontSize) < 1e-6 ? o : { ...o, fontSize };
}
