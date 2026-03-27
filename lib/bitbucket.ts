export interface BitbucketPR {
  id: number;
  title: string;
  state: string;
  author: string;
  repo: string;
  project: string;
  createdOn: string;
  updatedOn: string;
  url: string;
  reviewers: string[];
  isAuthor: boolean;
  isReviewer: boolean;
  commentCount: number;
}

function mapPR(pr: any, isAuthor: boolean, isReviewer: boolean): BitbucketPR {
  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: pr.author?.display_name ?? "Unknown",
    repo: pr.destination?.repository?.name ?? "Unknown",
    project: pr.destination?.repository?.project?.name ?? "Unknown",
    createdOn: pr.created_on,
    updatedOn: pr.updated_on,
    url: pr.links?.html?.href ?? "#",
    reviewers: (pr.reviewers ?? []).map((r: any) => r.display_name),
    isAuthor,
    isReviewer,
    commentCount: pr.comment_count ?? 0,
  };
}

export async function fetchMyBitbucketPRs(): Promise<BitbucketPR[]> {
  const workspaceRaw = process.env.BITBUCKET_WORKSPACE;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.BITBUCKET_API_TOKEN;

  if (!workspaceRaw || !email || !token) {
    throw new Error("Missing Bitbucket env vars. Check BITBUCKET_WORKSPACE, JIRA_EMAIL, BITBUCKET_API_TOKEN.");
  }

  // Extract workspace slug from full URL or use as-is
  const workspace = workspaceRaw
    .replace(/https?:\/\/bitbucket\.org\//, "")
    .replace(/\/.*$/, "");

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  // Get the current user's account UUID
  const userRes = await fetch("https://api.bitbucket.org/2.0/user", { headers });
  if (!userRes.ok) {
    const text = await userRes.text();
    throw new Error(`Bitbucket API error ${userRes.status}: ${text}`);
  }
  const userData = await userRes.json();
  const accountId = userData.uuid;

  const states = "state=OPEN&state=MERGED&state=DECLINED";

  // Fetch authored PRs using the new workspace-scoped endpoint
  const authoredRes = await fetch(
    `https://api.bitbucket.org/2.0/workspaces/${workspace}/pullrequests/${accountId}?${states}&pagelen=50&sort=-updated_on`,
    { headers, next: { revalidate: 300 } }
  );
  if (!authoredRes.ok) {
    const text = await authoredRes.text();
    throw new Error(`Bitbucket API error ${authoredRes.status}: ${text}`);
  }
  const authoredData = await authoredRes.json();

  const results: BitbucketPR[] = [];
  const seen = new Set<number>();

  for (const pr of authoredData.values ?? []) {
    seen.add(pr.id);
    results.push(mapPR(pr, true, false));
  }

  // Fetch open reviewer PRs by querying workspace repos
  const reposRes = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${workspace}?pagelen=100&sort=-updated_on`,
    { headers, next: { revalidate: 300 } }
  );
  if (reposRes.ok) {
    const reposData = await reposRes.json();
    const repos: string[] = (reposData.values ?? []).map((r: any) => r.slug);

    const reviewerFetches = repos.map((slug) =>
      fetch(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${slug}/pullrequests?q=reviewers.uuid%3D%22${accountId}%22&state=OPEN&pagelen=50`,
        { headers, next: { revalidate: 300 } }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          for (const pr of data?.values ?? []) {
            if (seen.has(pr.id)) continue;
            seen.add(pr.id);
            results.push(mapPR(pr, false, true));
          }
        })
        .catch(() => null)
    );

    await Promise.all(reviewerFetches);
  }

  return results.sort((a, b) => new Date(b.updatedOn).getTime() - new Date(a.updatedOn).getTime());
}
