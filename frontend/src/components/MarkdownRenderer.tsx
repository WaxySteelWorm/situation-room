import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from 'react';
import { ExternalLink, Copy, Check, Maximize2, X } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className="prose prose-invert prose-sm max-w-none"
        components={{
          // Headers
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-white mt-6 mb-4 pb-2 border-b border-gray-700">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-white mt-5 mb-3 pb-1 border-b border-gray-800">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-white mt-4 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-gray-200 mt-3 mb-2">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-semibold text-gray-300 mt-2 mb-1">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-sm font-medium text-gray-400 mt-2 mb-1">{children}</h6>
          ),

          // Paragraphs
          p: ({ children }) => (
            <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
            >
              {children}
              <ExternalLink size={12} />
            </a>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-1 text-gray-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-300">{children}</ol>
          ),
          li: ({ children }) => <li className="text-gray-300">{children}</li>,

          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 py-1 my-4 bg-gray-800/50 rounded-r italic text-gray-400">
              {children}
            </blockquote>
          ),

          // Code blocks
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !match && !className;

            if (isInline) {
              return (
                <code className="bg-gray-800 text-pink-400 px-1.5 py-0.5 rounded text-sm font-mono">
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group my-4">
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopyCode(codeString)}
                    className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                    title="Copy code"
                  >
                    {copiedCode === codeString ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                {match && (
                  <div className="absolute left-2 top-2 text-xs text-gray-500 font-mono">
                    {match[1]}
                  </div>
                )}
                <SyntaxHighlighter
                  style={oneDark}
                  language={match ? match[1] : 'text'}
                  PreTag="div"
                  className="rounded-lg !mt-0 !bg-gray-900 border border-gray-700"
                  customStyle={{ padding: '2rem 1rem 1rem 1rem' }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          },

          // Tables (GFM)
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-700 rounded-lg overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-800">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-gray-700">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-gray-800/50">{children}</tr>,
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-sm font-semibold text-gray-200">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-gray-300">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="my-6 border-gray-700" />,

          // Images with lightbox
          img: ({ src, alt }) => {
            // Check if it's a draw.io file
            const isDrawio = src?.endsWith('.drawio') || src?.endsWith('.drawio.svg');

            return (
              <span className="block my-4">
                <span className="relative inline-block group">
                  <img
                    src={src}
                    alt={alt || ''}
                    className="max-w-full h-auto rounded-lg border border-gray-700 cursor-pointer hover:border-gray-500 transition-colors"
                    onClick={() => src && setExpandedImage(src)}
                  />
                  <button
                    onClick={() => src && setExpandedImage(src)}
                    className="absolute top-2 right-2 p-1.5 bg-gray-900/80 hover:bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white"
                    title="Expand image"
                  >
                    <Maximize2 size={14} />
                  </button>
                </span>
                {alt && <span className="block text-center text-sm text-gray-500 mt-2">{alt}</span>}
                {isDrawio && (
                  <span className="block text-center text-xs text-gray-600 mt-1">
                    draw.io diagram
                  </span>
                )}
              </span>
            );
          },

          // Task lists (GFM)
          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 rounded bg-gray-700 border-gray-600 text-blue-500"
                />
              );
            }
            return <input type={type} />;
          },

          // Strikethrough
          del: ({ children }) => <del className="text-gray-500">{children}</del>,

          // Strong/bold
          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,

          // Emphasis/italic
          em: ({ children }) => <em className="text-gray-200 italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Image lightbox */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <button
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
          <img
            src={expandedImage}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
