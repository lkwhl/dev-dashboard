export interface Commit {
  hash: string;
  date: string;       // ISO datetime
  dateStr: string;    // YYYY-MM-DD
  message: string;
  repo: string;
  repoSlug: string;
  url: string;
  jiraKeys: string[];
}

function extractJiraKeys(message: string): string[] {
  const matches = message.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [];
  return Array.from(new Set(matches));
}

export async function fetchMyCommitsForYear(year: number): Promise<Commit[]> {
  const workspaceRaw = process.env.BITBUCKET_WORKSPACE;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.BITBUCKET_API_TOKEN;

  if (!workspaceRaw || !email || !token) {
    throw new Error("Missing Bitbucket env vars.");
  }

  const workspace = workspaceRaw
    .replace(/https?:\/\/bitbucket\.org\//, "")
    .replace(/\/.*$/, "");

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  // Get current user's UUID for author matching
  const userRes = await fetch("https://api.bitbucket.org/2.0/user", { headers });
  if (!userRes.ok) throw new Error(`Bitbucket user error ${userRes.status}`);
  const userData = await userRes.json();
  const accountId: string = userData.uuid;

  // Get all repos in the workspace
  const reposRes = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${workspace}?pagelen=100&sort=-updated_on`,
    { headers }
  );
  if (!reposRes.ok) throw new Error(`Bitbucket repos error ${reposRes.status}`);
  const reposData = await reposRes.json();
  const repos: { slug: string; name: string }[] = (reposData.values ?? []).map((r: any) => ({
    slug: r.slug,
    name: r.name,
  }));

  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`);
  const allCommits: Commit[] = [];

  // Fetch commits per repo in parallel; paginate until we pass yearStart
  await Promise.all(
    repos.map(async (repo) => {
      let nextUrl: string | null =
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo.slug}/commits?pagelen=100`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl, { headers });
        if (!res.ok) return;

        const data: any = await res.json();
        const commits: any[] = data.values ?? [];
        let reachedBefore = false;

        for (const c of commits) {
          const commitDate = new Date(c.date);

          if (commitDate < yearStart) { reachedBefore = true; break; }
          if (commitDate >= yearEnd) continue;

          // Match by UUID (linked account) or email in raw author string
          const isMe =
            c.author?.user?.uuid === accountId ||
            (c.author?.raw ?? "").includes(email);

          if (!isMe) continue;

          allCommits.push({
            hash: c.hash,
            date: c.date,
            dateStr: c.date.slice(0, 10),
            message: (c.message ?? "").trim(),
            repo: repo.name,
            repoSlug: repo.slug,
            url: `https://bitbucket.org/${workspace}/${repo.slug}/commits/${c.hash}`,
            jiraKeys: extractJiraKeys(c.message ?? ""),
          });
        }

        nextUrl = reachedBefore || !data.next ? null : (data.next as string);
      }
    })
  );

  return allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
