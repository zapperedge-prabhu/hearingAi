declare module '@iarna/rtf-to-html' {
  import { Readable, Writable } from 'stream';

  interface RTFOptions {
    paraBreaks?: string;
    paraTag?: string;
    template?: (doc: any, defaults: any, content: string) => string;
    disableFonts?: boolean;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    foreground?: { red: number; blue: number; green: number };
    background?: { red: number; blue: number; green: number };
    firstLineIndent?: number;
    indent?: number;
    align?: string;
    valign?: string;
  }

  type Callback = (err: Error | null, html: string) => void;

  function rtfToHTML(callback: Callback): Writable;
  function rtfToHTML(opts: RTFOptions, callback: Callback): Writable;

  namespace rtfToHTML {
    function fromStream(stream: Readable, callback: Callback): void;
    function fromStream(stream: Readable, opts: RTFOptions, callback: Callback): void;
    function fromString(rtf: string, callback: Callback): void;
    function fromString(rtf: string, opts: RTFOptions, callback: Callback): void;
  }

  export = rtfToHTML;
}
