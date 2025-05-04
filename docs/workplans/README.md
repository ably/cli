# Workplans

This folder contains a list of workplans used by agents to deliver larger features. The workplans are maintained simply for future developers/agents to understand retrospectively how features were implemented.

Each workplan file is a markdown file named with the date in the format [yyyy-mm-dd] and then with a title describing the plan. Each workplan file includes a list of tasks that are marked off when completed.

## Example brief for Agent

```
Please look at all the tasks tagged with [feat/terminal-server-improvements] in @TODO.md, and write up a plan to implement all of the tagged features.

Note:

1) Your job is not to implement this yet, your job is to understand the code base fully, the features, and come up with a robust plan that allows another agent to follow the tasks and implement this all interatively and logically in groups of functionality.
2) Your plan must abide by all the best practices and requirements defined in the .cursor/rules and /docs folder. Make sure you have read every single file in @rules and @docs and any associated files that they reference that are relevant before you propose a plan.
3) Consider what test coverage is needed and include that in the plan.
4) Document your plan in the the docs/workplans folder with a file named and structured as described in @README.md, and ensure all documentation and rules, where applicable, are updated as you proceed through the plan, and all @TODO.md tasks are marked as complete when done.

You need to use maximum effort researching this code base and the requested features so that we have a solid plan that can be exectued in steps and committed to git in each stage.
```
