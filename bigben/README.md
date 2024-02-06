# The bell tolls...

1. The bot joins the channel with the most users in it according
   to the given cron pattern

2. The bot mutes everybody but itself

3. The bot plays the given audio resource

4. The bot unmutes everybody

5. The bot leaves

## Installation

Install dependencies

`npm install`

Build with Typescript

`npm run build`

Run index.js

`node dist/index.js`

## Environment variables

The [.env template](/.env.template) details all of the required variables.

Notes

- The cron pattern is based on the extended [node cron](https://www.npmjs.com/package/cron) syntax
