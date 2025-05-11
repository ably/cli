// Temporary stub for legacy terminal-box until fully removed.
export const colour = {
  reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '', magenta: '', cyan: '',
};
export interface TerminalBox {
  row: number; width: number; content: string[]; term: any; height: number;
}
export function drawBox(..._args:any[]): TerminalBox { return {row:0,width:0,content:[],term:null,height:0}; }
export function clearBox(_: TerminalBox): void {}
export function updateLine(_: TerminalBox,__:number,___:string,____?:string): void {}
export function updateSpinner(): void {} 