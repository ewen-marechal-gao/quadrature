declare module "pagedjs" {
  export class Previewer {
    preview(
      content: string | Element,
      stylesheets: string[],
      renderTo: Element | null
    ): Promise<{ total: number }>;
  }
}
