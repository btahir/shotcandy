/** Inline <head> script: apply a saved theme and the narrow-layout flag before first paint. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("shotcandy:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
