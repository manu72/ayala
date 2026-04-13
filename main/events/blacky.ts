import { RpgEvent, EventData, RpgPlayer, EventMode } from '@rpgjs/server'

@EventData({
    name: 'blacky',
    hitbox: {
        width: 32,
        height: 16
    },
    mode: EventMode.Scenario
})
export default class BlackyEvent extends RpgEvent {
    onInit() {
        this.setGraphic('blacky')
        this.speed = 1
    }

    async onAction(player: RpgPlayer) {
        const metBefore = player.getVariable('MET_BLACKY')

        if (!metBefore) {
            await player.showText('Mrrp. New here, are you?', {
                talkWith: this
            })
            const choice = await player.showChoices('', [
                { text: 'Mrrp?', value: 'curious' },
                { text: '...', value: 'silent' }
            ])
            await player.showText('This is Ayala Triangle. The gardens are home to all of us. Find shade. Find food. Stay away from the roads.', {
                talkWith: this
            })
            await player.showText('And at night... stay hidden. Not all humans are kind.', {
                talkWith: this
            })
            player.setVariable('MET_BLACKY', true)
        } else {
            await player.showText('Still here? Good. You\'re tougher than you look.', {
                talkWith: this
            })
        }
    }
}
