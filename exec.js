const { execSync } = require('child_process');
const yargs = require('yargs');
const compact = require('lodash/compact');
const _ = require('lodash');
const color = {
    fgBlue: '\x1b[34m',  // Blue foreground color ANSI escape code
    reset: '\x1b[0m',      // Reset ANSI escape code
};

const ticketPatterns = ['AFE-', 'RSB-', 'SPB-', 'TABT-']; // App project tags
const ticketRegExp = /\b[A-Z]+-\d+\b/g; // Regular expression to match JIRA ticket numbers

// get all tickets that have been worked on in a specific set of commits
// ASSUMPTION - all commits are tagged with the ticket that they are relevant to. Is this automatic or manual? What happens to commits that aren't tagged?
const extractTicketsFromCommits = commits => {
    const ticketsList = [];
    commits.forEach(commitMessage => {
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


// worker app -> create specific release branches
// branch off develop branch
// 
const getUniqueTicketsBetweenBranches = (targetBranch, sourceBranch, repositoryPath) => {
    execSync(`git -C ${repositoryPath} fetch`);
    const cherryPickedCommits = execSync(`git -C ${repositoryPath} log --cherry-pick --oneline origin/${targetBranch} ^origin/${sourceBranch}`)
        // --cherry-pick filters out semantically same commits
        // if we run all commits (below), it pulls in all changes
        // cherryPickedCommits finds all commits, if they have the same message. There exists a whole bunch of duplicate stuff from old cherry picks that have different commit IDs but same code. 
        // We should get these so we can ignore them

        // cherry pick is used to grab individual commits from dev branch (which contains all up to date code)
        .toString()
        .trim()
        .split('\n');
    const allCommits = execSync(`git -C ${repositoryPath} log --oneline origin/${targetBranch}..origin/${sourceBranch}`)
        .toString()
        .trim()
        .split('\n');
    const allTickets = extractTicketsFromCommits(allCommits); // get all tickets
    const cherryPickedTickets = extractTicketsFromCommits(cherryPickedCommits); // get cherry picked tickets (figure out what these are)
    const newTickets = _.difference(allTickets, cherryPickedTickets); // find any new tickets that did not exist before. What happens to badly tagged commits here?
    // All new commits, excluding dup old cherry pick weird commits

    // ie its valid as per the Regex starts with, but the number is made up or invalid or matches an old ticket? Do we care? Does this ever happen. ==> we don't care
    const validTickets = newTickets.filter(ticket => ticketPatterns.some(pattern => ticket.startsWith(pattern)));
    return validTickets.sort();
};


/**
 * Example script
 * npm run app-tickets -- --sourceBranch=develop --targetBranch=worker-app-5.1.0-RP6165_RSPP --type=list
 */
const argv = yargs // how does yargs works
    .option('targetBranch', {
        description: 'The name of the target branch',
        type: 'string',
        demandOption: true,
    })
    .option('sourceBranch', {
        description: 'The name of the source branch',
        type: 'string',
        default: 'develop',
        demandOption: false,
    })
    .option('responseType', {
        description: 'The type of the response',
        type: 'string',
        demandOption: false,
        default: 'jira',
        choices: ['jira', 'list'],
    }).argv;


const getAllCommits = () => {
    const {
        targetBranch,
        sourceBranch,
        responseType,
    } = argv || {};
    if (!targetBranch || !sourceBranch || !responseType) {
        console.error(
            `Please provide all the params of this script. Missing ${compact([
                // on develop 
                !targetBranch && '--targetBranch', // newer changes --> develop (because the new release should mirror develop on creation)
                !sourceBranch && '--sourceBranch', // old changes --> will normally be the previous release
                !responseType && '--responseType'
            ]).join(', ')}`
        );
        process.exit(1);
    }

    console.log(`-> ${color.fgBlue}Fetching commits of worker app${color.reset}`); // REPO 1
    const appTickets = getUniqueTicketsBetweenBranches(targetBranch, sourceBranch, './');

    console.log(`-> ${color.fgBlue}Fetching commits of partner resources${color.reset}`);
    const partnerResourcesSourceBranch = sourceBranch !== 'develop' ? sourceBranch : 'worker/merged'; // what is the partner resource branch ??  // REPO 2
    const resourceTickets = getUniqueTicketsBetweenBranches(targetBranch, partnerResourcesSourceBranch, '../frontend-partner-resources');

    console.log(`-> ${color.fgBlue}Fetching commits of environment configurations${color.reset}\n`);
    const envConfigsSourceBranch = sourceBranch !== 'develop' ? sourceBranch : 'worker/merged'; // why do we need configurations seperately, what is in this  // REPO 3
    const configTickets = getUniqueTicketsBetweenBranches(targetBranch, envConfigsSourceBranch, '../frontend-environment-configurations');
    
    const totalTickets = _.uniqWith([...appTickets, ...resourceTickets, ...configTickets], _.isEqual);

    if (responseType === 'list') {
        execSync(`echo ${totalTickets.join(' ')} | pbcopy`); //
    } else {
        const joiner = '%2C%20'; // comma + space
        const url = `https://swipejobs.atlassian.net/issues/?jql=issueKey%20in%20(${totalTickets.join(joiner)})`;
        const quotedUrl =`"${url}"`;
        execSync(`echo ${quotedUrl} | pbcopy`); // does pbcopy just put in clipboard so you run this script then head to jira and paste
    }

    console.log(`-> ${color.fgBlue}List of tickets: ${color.reset}${totalTickets.join(', ')}`);
    console.log(`-> ${color.fgBlue}Number of tickets: ${color.reset}${totalTickets.length}${color.reset}`);
};

getAllCommits();

// Updates to a ticket that has already been tagged and included in release, but maybe not updated version


// why can't the release planner just mock whatever the CLI is doing when we run this script?