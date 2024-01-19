import * as discord from 'discord.js'

export default class Muter {
    constructor(private readonly members: discord.GuildMember[]) {}

    private muteOne(member: discord.GuildMember) {
        return member.voice.setMute(true, "The bell tolls...");
    }

    async mute() {
        return Promise.all(this.members.map(this.muteOne));
    }

    private unmuteOne(member: discord.GuildMember) {
        return member.voice.setMute(false, "The bell is done tolling.");
    }

    async unmute() {
        return Promise.all(this.members.map(this.unmuteOne));
    }
}