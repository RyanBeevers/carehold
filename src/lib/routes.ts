/**
 * Public navigation only. Never add household/profile identifiers, medication
 * data, notes, recipient IDs, drafts or authentication tokens to routes.
 */
export type AppPage='today'|'people'|'words'|'circle'|'settings';
export const APP_PATHS:Readonly<Record<AppPage,string>>={
 today:'/today',people:'/people',words:'/words',circle:'/circle',settings:'/settings'
};
const entries=Object.entries(APP_PATHS) as [AppPage,string][];
export function pagePath(page:AppPage):string{return APP_PATHS[page];}
export function pageFromPath(pathname:string):AppPage{
 const clean=pathname.replace(/\/+$/,'')||'/';
 if(clean==='/')return 'today';
 const result=entries.find(([,path])=>path===clean);
 return result?.[0]??'today';
}
export function canonicalPagePath(pathname:string):string{
 return pagePath(pageFromPath(pathname));
}
/** Only normal left clicks should be intercepted. Others keep native link behavior. */
export function shouldHandlePageClick(
 click:{button:number,defaultPrevented:boolean,metaKey:boolean,ctrlKey:boolean,shiftKey:boolean,altKey:boolean}
):boolean{
 return click.button===0&&!click.defaultPrevented&&!click.metaKey&&!click.ctrlKey&&!click.shiftKey&&!click.altKey;
}
