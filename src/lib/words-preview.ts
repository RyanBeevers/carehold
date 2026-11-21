export type PreviewMode='private'|'recipients';
export type RecipientOption={id:string,name:string};
export const WORDS_DRAFT_MAX_LENGTH=3000;

/**
 * Selection is UI-only. Returning [] when private avoids accidentally
 * carrying recipient IDs into later persistence work.
 */
export function previewRecipients(
 mode:PreviewMode,available:readonly RecipientOption[],selected:readonly string[]
):RecipientOption[]{
 if(mode!=='recipients')return [];
 const chosen=new Set(selected.slice(0,10));
 return available.filter(r=>chosen.has(r.id)).slice(0,10);
}
export function previewDisclosureLabel(mode:PreviewMode,selectedCount:number):string{
 if(mode==='private')return 'Only me — not saved';
 return selectedCount===0?'Recipient preview — nobody selected':`Recipient preview — ${selectedCount} selected (not sent)`;
}
