--!strict
-- Configuração do Hub. Ajuste aqui sem mexer no resto do código.

export type PortalConfig = {
	Name: string, -- nome interno (e nome da Part em workspace.Portais, se você criar a sua)
	DisplayName: string, -- texto mostrado em cima do portal
	MaxPlayers: number,
	Reserved: boolean, -- true = servidor privado só para o grupo; false = servidor público
	Color: Color3,
	Position: Vector3, -- usado só se o portal for gerado automaticamente
}

-- Mensagens que o servidor manda para o cliente sobre a fila.
export type QueueStatus =
	{ kind: "idle" }
	| { kind: "queue", portal: string, count: number, max: number, seconds: number }
	| { kind: "teleporting" }
	| { kind: "failed", message: string }

local HubConfig = {
	-- PlaceId do lugar do JOGO de pesca (não o do hub).
	-- Studio: Asset Manager > Places > botão direito no lugar > Copy ID.
	GAME_PLACE_ID = 0,

	-- Segundos de espera depois que alguém entra num portal.
	COUNTDOWN_SECONDS = 15,
	-- Quando o portal enche, a contagem cai para este valor.
	FULL_COUNTDOWN_SECONDS = 3,

	TELEPORT_RETRIES = 3,

	-- Altura máxima acima do portal em que o jogador ainda conta como "dentro".
	ZONE_HEIGHT = 10,

	PORTALS = {
		{
			Name = "Solo",
			DisplayName = "🎣 Solo",
			MaxPlayers = 1,
			Reserved = true,
			Color = Color3.fromRGB(80, 200, 255),
			Position = Vector3.new(-30, 0.5, -40),
		},
		{
			Name = "Grupo",
			DisplayName = "👥 Grupo",
			MaxPlayers = 4,
			Reserved = true,
			Color = Color3.fromRGB(120, 255, 140),
			Position = Vector3.new(0, 0.5, -40),
		},
		{
			Name = "Publico",
			DisplayName = "🌊 Público",
			MaxPlayers = 8,
			Reserved = false,
			Color = Color3.fromRGB(255, 200, 80),
			Position = Vector3.new(30, 0.5, -40),
		},
	} :: { PortalConfig },
}

return HubConfig
