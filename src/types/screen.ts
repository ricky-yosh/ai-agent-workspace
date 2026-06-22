export interface Vertex {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  v1: string;
  v2: string;
  border: boolean;
}

export interface Area {
  id: string;
  v1: string;
  v2: string;
  v3: string;
  v4: string;
  panel_type: string;
  terminal_id: string | null;
}

export interface Screen {
  vertices: Vertex[];
  edges: Edge[];
  areas: Area[];
}

export type Axis = "horizontal" | "vertical";

/** A saved layout template — screen is the saved screen, replaces the old tree field. */
export interface Layout {
  id: string;
  name: string;
  screen: Screen;
  built_in: boolean;
}
