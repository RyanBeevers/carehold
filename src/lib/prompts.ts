export type Prompt={id:string,direction:'parent-to-child'|'child-to-parent'|'anyone',topic:string,text:string};
/** Curated static content. No freeform drafts or responses leave the device. */
export const prompts:Prompt[]=[
 {id:'p1',direction:'parent-to-child',topic:'Check-in',text:'What has felt easier lately, and what has felt harder?'},
 {id:'p2',direction:'parent-to-child',topic:'Being heard',text:'Is there something you wish I understood better about your day?'},
 {id:'p3',direction:'parent-to-child',topic:'Support',text:'When things feel overwhelming, what kind of help actually helps?'},
 {id:'p4',direction:'parent-to-child',topic:'Choice',text:'Would you rather talk, write, or just spend a little time together?'},
 {id:'p5',direction:'parent-to-child',topic:'Small joys',text:'What was one tiny moment today that made you feel good?'},
 {id:'p6',direction:'parent-to-child',topic:'Reset',text:'What could we change about a routine to make tomorrow gentler?'},
 {id:'c1',direction:'child-to-parent',topic:'Listening',text:'Can I tell you something without needing advice right away?'},
 {id:'c2',direction:'child-to-parent',topic:'Space',text:'I need some time to think. Can we talk about this later?'},
 {id:'c3',direction:'child-to-parent',topic:'Connection',text:'Can we spend a little time together, just us?'},
 {id:'c4',direction:'child-to-parent',topic:'Feelings',text:'I’m not sure how to explain what I feel. Could you help me find the words?'},
 {id:'c5',direction:'child-to-parent',topic:'Reassurance',text:'Could you listen to my side before we figure out what to do next?'},
 {id:'c6',direction:'child-to-parent',topic:'Help',text:'I need help with something, but I’m nervous to bring it up.'},
 {id:'a1',direction:'anyone',topic:'Gratitude',text:'Something I appreciate about you is…'},
 {id:'a2',direction:'anyone',topic:'Repair',text:'Something I wish I had said differently is…'},
 {id:'a3',direction:'anyone',topic:'Curiosity',text:'What helps you feel safe when conversations get difficult?'},
 {id:'a4',direction:'anyone',topic:'Together',text:'What is one small thing we can do this week to make home feel better?'}
];
