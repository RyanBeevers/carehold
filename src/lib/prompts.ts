import type {Audience} from '../../shared/audience';
export type Prompt={id:string,audience:Audience|'all',topic:string,text:string};
/** Static prompt copy only. No private journaling or activity is persisted. */
export const prompts:readonly Prompt[]=[
 {id:'p1',audience:'parent',topic:'Check-in',text:'What felt easier today, and what felt harder?'},
 {id:'p2',audience:'parent',topic:'Listening',text:'Would you like me to listen, help solve it, or just be with you?'},
 {id:'p3',audience:'parent',topic:'Autonomy',text:'Is there something you wish you had more say in lately?'},
 {id:'p4',audience:'parent',topic:'Connection',text:'Would talking, writing, or doing something side by side feel better?'},
 {id:'p5',audience:'parent',topic:'Small joys',text:'What is one little moment you want us to remember?'},
 {id:'p6',audience:'parent',topic:'Repair',text:'Is there something I could do differently to help you feel heard?'},
 {id:'p7',audience:'parent',topic:'Choice',text:'Would you rather choose when to talk about this?'},
 {id:'p8',audience:'parent',topic:'Support',text:'What kind of help would feel useful this week?'},
 {id:'k1',audience:'child',topic:'Feelings',text:'I feel ___ and I want you to know.'},
 {id:'k2',audience:'child',topic:'A little break',text:'Can we have a quiet moment together?'},
 {id:'k3',audience:'child',topic:'Listening',text:'Can I tell you what happened and you just listen?'},
 {id:'k4',audience:'child',topic:'Choice',text:'Can I point, draw, or write instead of talking?'},
 {id:'k5',audience:'child',topic:'Help',text:'This feels too big. Can you help me?'},
 {id:'k6',audience:'child',topic:'Space',text:'I need some time before I talk.'},
 {id:'k7',audience:'child',topic:'Connection',text:'Can we do something together, just us?'},
 {id:'k8',audience:'child',topic:'Repair',text:'Can we try that again?'},
 {id:'t1',audience:'teen',topic:'Being heard',text:'I want to tell you something without getting advice yet.'},
 {id:'t2',audience:'teen',topic:'Privacy',text:'There is something I want to keep private for now. Can we talk about what I am comfortable sharing?'},
 {id:'t3',audience:'teen',topic:'Independence',text:'Can we work out a decision where I have more say?'},
 {id:'t4',audience:'teen',topic:'Repair',text:'I think we misunderstood each other. Can I try explaining my side again?'},
 {id:'t5',audience:'teen',topic:'Space',text:'I need a little time to process. Can we check in later?'},
 {id:'t6',audience:'teen',topic:'Support',text:'I could use your support. I am not sure exactly what I need yet.'},
 {id:'t7',audience:'teen',topic:'Boundaries',text:'Can we agree on a better way to bring this up next time?'},
 {id:'t8',audience:'teen',topic:'Connection',text:'Want to spend some time together without making it a big conversation?'},
 {id:'a1',audience:'all',topic:'Gratitude',text:'One thing I appreciate about you is…'},
 {id:'a2',audience:'all',topic:'Care',text:'Something that helped me today was…'},
 {id:'a3',audience:'all',topic:'Together',text:'One small thing we could do together this week is…'},
];
export function promptsForAudience(audience:Audience):Prompt[]{
 return prompts.filter(p=>p.audience==='all'||p.audience===audience);
}
