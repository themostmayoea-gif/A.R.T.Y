--!strict
-- Teleporte com repetição automática e tratamento de erro.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TeleportService = game:GetService("TeleportService")

local HubConfig = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("HubConfig"))

local TeleportManager = {}

-- Retorna (sucesso, mensagem de erro amigável).
function TeleportManager.teleportGroup(group: { Player }, portal: HubConfig.PortalConfig): (boolean, string?)
	if RunService:IsStudio() then
		return false, "O teleporte não funciona no Studio. Publique e teste num servidor real."
	end
	if HubConfig.GAME_PLACE_ID == 0 then
		return false, "GAME_PLACE_ID não foi configurado no HubConfig."
	end

	local options = Instance.new("TeleportOptions")
	options.ShouldReserveServer = portal.Reserved
	-- Só informativo: TeleportData passa pelo cliente, então nunca coloque moedas/itens aqui.
	options:SetTeleportData({ fromHub = true, mode = portal.Name })

	for attempt = 1, HubConfig.TELEPORT_RETRIES do
		-- Remove quem saiu do jogo durante as tentativas.
		local valid: { Player } = {}
		for _, player in group do
			if player.Parent == Players then
				table.insert(valid, player)
			end
		end
		if #valid == 0 then
			return false, nil
		end

		local ok, err = pcall(function()
			TeleportService:TeleportAsync(HubConfig.GAME_PLACE_ID, valid, options)
		end)
		if ok then
			return true, nil
		end

		warn(`[Hub] Teleporte falhou (tentativa {attempt}/{HubConfig.TELEPORT_RETRIES}): {err}`)
		if attempt < HubConfig.TELEPORT_RETRIES then
			task.wait(attempt * 2)
		end
	end

	return false, "Não deu para entrar no jogo agora. Tente de novo!"
end

return TeleportManager
