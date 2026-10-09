// Source aliasing: PDF file names can contain private context (an employer name, a role). Everything that is
// committed or published (content JSON, reports, site) refers to sources by a neutral alias like "ref-aws-cloud".
// The real file names stay in the git-ignored sources/ and extracted/ folders.
const STOP = new Set(['ford', 'interview', 'preparation', 'deep', 'for', 'questions', 'answers', 'and', 'the', 'pdf']);

export const slugOf = (file) => file.toLowerCase().replace(/\.pdf$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function aliasFromSlug(slug) {
  const tokens = slug.split('-').filter((t) => t && !STOP.has(t));
  return 'ref-' + (tokens.slice(0, 5).join('-') || 'source');
}
export const aliasFromFile = (file) => aliasFromSlug(slugOf(file));
