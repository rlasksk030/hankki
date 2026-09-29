import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { analyzeMonth } from '../src/lib/analyzer/analyze';
import { EXPECTED_MONTHS } from './expected';
const path = 'tests/fixtures/private/android-2026-09.jpeg';

for(const width of [1440,945,720]) (existsSync(path) ? it : it.skip)(`actual Android ${width}px: all September days`,async()=>{
 const {data,info}=await sharp(path).resize({width}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const img={data,width:info.width,height:info.height};
 const result=analyzeMonth(img,{year:2026,month:9});
 expect(result.ok).toBe(true);
 if(result.ok){expect(result.days.map(d=>d.shift)).toEqual(EXPECTED_MONTHS['2026-09']);expect(result.check).toMatchObject({status:'ok',by:'title'});}
});
