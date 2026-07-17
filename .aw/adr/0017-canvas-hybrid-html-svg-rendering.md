# Canvas overhaul: hybrid HTML+SVG rendering

The Visual Canvas Panel is being overhauled (frontend only — the SQLite schema, commands, CDC events, and MCP tools are unchanged). The current renderer is pure SVG: nodes are `<rect>` + `<foreignObject>` inside one `<svg>`. We are replacing it with hybrid rendering, proven in the clapet-canvas prototype: nodes are absolutely-positioned HTML divs, edges and interaction overlays are SVG, both layered under a single CSS `translate3d + scale` viewport transform.

Chosen because `foreignObject` is the source of real fragility (Safari bugs, clipping, awkward inline editing) while HTML nodes give crisp text, real layout, and straightforward CSS animation of node chrome. The cost accepted: `CanvasRenderer.tsx` is rewritten rather than incrementally edited, and hit-testing spans two layers (DOM `elementFromPoint` for nodes, SVG hit paths for edges).
