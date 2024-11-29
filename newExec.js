const axios = require('axios');
const _ = require('lodash');
const yargs = require('yargs');
const compact = require('lodash/compact');
const { GIT_TOKEN } = require('./secretFile');
const color = {
    fgBlue: '\x1b[34m',  // Blue foreground color ANSI escape code
    reset: '\x1b[0m',      // Reset ANSI escape code
};

const ticketPatterns = ['AFE-', 'RSB-', 'SPB-', 'TABT-']; // App project tags
//const ticketRegExp = /\b[A-Z]+-\d+\b/g; // Regular expression to match JIRA ticket numbers
const ticketRegExp = /.*/s; // Regular expression to match JIRA ticket numbers

// GitHub API base URL and token for authentication
const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_TOKEN = GIT_TOKEN;  // GitHub token


const getGitHubCommits = async (owner, repo, baseBranch, headBranch) => {
    const url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/compare/${baseBranch}...${headBranch}`;

    const response = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
        },
    });

    if (response.status !== 200) {
        throw new Error('Failed to fetch commits from GitHub API');
    }

    return response.data.commits;
};

// Extract JIRA ticket numbers from commit messages
const extractTicketsFromCommits = (commits) => {
    const ticketsList = [];
    commits.forEach(commit => {
        const commitMessage = commit.commit.message;
        const matches = commitMessage.match(ticketRegExp);
        if (matches) {
            matches.forEach(match => {
                if (!ticketsList.includes(match)) {
                    ticketsList.push(match);
                }
            });
        }
    });
    return ticketsList;
};

// Filter out valid tickets based on the pattern
const getValidTickets = (allTickets) => {
    return allTickets.filter(ticket => ticketPatterns.some(pattern => ticket.startsWith(pattern)));
};

// Main function to get unique tickets between two branches
const getUniqueTicketsBetweenBranches = async (owner, repo, targetBranch, sourceBranch) => {
    try {
        // Fetch commits from GitHub API
        console.log(`Fetching commits from GitHub for branches ${sourceBranch} and ${targetBranch}`);
        const commits = await getGitHubCommits(owner, repo, sourceBranch, targetBranch);
        console.log(commits);
        const allTickets = extractTicketsFromCommits(commits);
        //const validTickets = getValidTickets(allTickets);
        const validTickets = allTickets;

        console.log(`Found tickets: ${validTickets.join(', ')}`);
        return validTickets.sort();
    } catch (error) {
        console.error('Error fetching or processing commits:', error);
    }
};

// Command-line argument parsing with yargs
const argv = yargs
    .option('owner', {
        description: 'GitHub repository owner (organization or user)',
        type: 'string',
        demandOption: true,
    })
    .option('repo', {
        description: 'GitHub repository name',
        type: 'string',
        demandOption: true,
    })
    .option('targetBranch', {
        description: 'The name of the target branch',
        type: 'string',
        demandOption: true,
    })
    .option('sourceBranch', {
        description: 'The name of the source branch',
        type: 'string',
        default: 'develop',
    })
    .option('responseType', {
        description: 'The type of the response',
        type: 'string',
        demandOption: false,
        default: 'jira',
        choices: ['jira', 'list'],
    })
    .argv;

// Run the script
const getAllCommits = async () => {
    const { owner, repo, targetBranch, sourceBranch, responseType } = argv;

    if (!owner || !repo || !targetBranch || !sourceBranch || !responseType) {
        console.error(
            `Please provide all the params of this script. Missing ${compact([
                !owner && '--owner',
                !repo && '--repo',
                !targetBranch && '--targetBranch',
                !sourceBranch && '--sourceBranch',
                !responseType && '--responseType',
            ]).join(', ')}`
        );
        process.exit(1);
    }

    console.log(`-> ${color.fgBlue}Fetching commits for repository ${repo} from GitHub API${color.reset}`);

    const tickets = await getUniqueTicketsBetweenBranches(owner, repo, targetBranch, sourceBranch);
    console.log(tickets);
/*
    // Handle the responseType option
    if (responseType === 'list') {
        console.log(`Tickets: ${tickets.join(', ')}`);
    } else if (responseType === 'jira') {
        const joiner = '%2C%20'; // Comma + space
        const url = `https://swipejobs.atlassian.net/issues/?jql=issueKey%20in%20(${tickets.join(joiner)})`;
        const quotedUrl = `"${url}"`;
        console.log(`Jira URL: ${quotedUrl}`);
    }

    console.log(`-> ${color.fgBlue}Total tickets: ${color.reset}${tickets.length}`);
*/
};

// Start the script
getAllCommits();