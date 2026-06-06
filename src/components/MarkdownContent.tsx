interface Props {
  html: string;
  title?: string;
}

export function MarkdownContent({ html, title }: Props) {
  return (
    <article className="markdown-content">
      {title && <h1 className="page-title">{title}</h1>}
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
