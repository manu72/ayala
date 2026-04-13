import { RpgPlayer, type RpgPlayerHooks, Control, Components } from '@rpgjs/server'

const player: RpgPlayerHooks = {
    onConnected(player: RpgPlayer) {
        player.name = 'Mamma Cat'
        player.setComponentsTop(Components.text('{name}'))
        player.speed = 5
    },
    onInput(player: RpgPlayer, { input }) {
        if (input == Control.Back) {
            player.callMainMenu()
        }
    },
    async onJoinMap(player: RpgPlayer) {
        if (player.getVariable('AFTER_INTRO')) {
            return
        }
        await player.showText('*You are alone on a busy sidewalk. The car that brought you here is gone.*')
        await player.showText('*The air smells of exhaust and hot concrete. Somewhere beyond the noise, you hear... trees? Birds?*')
        await player.showText('*You need to find shelter. The gardens ahead look safer than this road.*')
        player.setVariable('AFTER_INTRO', true)
    }
}

export default player
