--!strict
-- Hub: portais com fila, contagem regressiva e teleporte para o jogo de pesca.
-- O servidor decide quem está em cada portal com base na posição do personagem;
-- o cliente só pode pedir para sair da fila.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TeleportService = game:GetService("TeleportService")

local HubConfig = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("HubConfig"))
local TeleportManager = require(script.Parent:WaitForChild("TeleportManager"))

type PortalState = {
	config: HubConfig.PortalConfig,
	pad: BasePart,
	label: TextLabel,
	members: { Player },
	timeLeft: number?,
	locked: boolean,
	lastKey: string,
}

local TICK = 0.2
local LEAVE_COOLDOWN = 0.5

-- Remotes ----------------------------------------------------------------

local remotes = Instance.new("Folder")
remotes.Name = "HubRemotes"

local queueStatusRemote = Instance.new("RemoteEvent")
queueStatusRemote.Name = "QueueStatus"
queueStatusRemote.Parent = remotes

local leaveQueueRemote = Instance.new("RemoteEvent")
leaveQueueRemote.Name = "LeaveQueue"
leaveQueueRemote.Parent = remotes

remotes.Parent = ReplicatedStorage

-- Estado ---------------------------------------------------------------------

local portals: { PortalState } = {}
local playerPortal: { [Player]: PortalState } = {}
local teleporting: { [Player]: boolean } = {}
local lastLeave: { [Player]: number } = {}

local function sendStatus(player: Player, status: HubConfig.QueueStatus)
	queueStatusRemote:FireClient(player, status)
end

-- Portais --------------------------------------------------------------------

local function getPortalFolder(): Folder
	local existing = workspace:FindFirstChild("Portais")
	if existing and existing:IsA("Folder") then
		return existing
	end
	local folder = Instance.new("Folder")
	folder.Name = "Portais"
	folder.Parent = workspace
	return folder
end

local function makeLabel(pad: BasePart): TextLabel
	local billboard = Instance.new("BillboardGui")
	billboard.Name = "PortalLabel"
	billboard.Size = UDim2.fromScale(12, 4) -- em studs
	billboard.StudsOffset = Vector3.new(0, 7, 0)
	billboard.MaxDistance = 150
	billboard.LightInfluence = 0
	billboard.Adornee = pad
	billboard.Parent = pad

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0
	label.Parent = billboard
	return label
end

-- Usa uma Part feita por você em workspace.Portais (mesmo nome do config)
-- ou gera uma automaticamente.
local function buildPortal(config: HubConfig.PortalConfig): PortalState
	local folder = getPortalFolder()
	local pad = folder:FindFirstChild(config.Name)

	if not (pad and pad:IsA("BasePart")) then
		local part = Instance.new("Part")
		part.Name = config.Name
		part.Anchored = true
		part.Size = Vector3.new(14, 1, 14)
		part.CFrame = CFrame.new(config.Position)
		part.Material = Enum.Material.Neon
		part.Color = config.Color
		part.Transparency = 0.25
		part.TopSurface = Enum.SurfaceType.Smooth
		part.Parent = folder

		local light = Instance.new("PointLight")
		light.Color = config.Color
		light.Range = 16
		light.Brightness = 2
		light.Parent = part

		pad = part
	end

	local padPart = pad :: BasePart
	local state: PortalState = {
		config = config,
		pad = padPart,
		label = makeLabel(padPart),
		members = {},
		timeLeft = nil,
		locked = false,
		lastKey = "",
	}
	return state
end

local function isInside(pad: BasePart, position: Vector3): boolean
	local rel = pad.CFrame:PointToObjectSpace(position)
	local half = pad.Size / 2
	return math.abs(rel.X) <= half.X and math.abs(rel.Z) <= half.Z and rel.Y >= 0 and rel.Y <= HubConfig.ZONE_HEIGHT
end

local function getRoot(player: Player): BasePart?
	local character = player.Character
	if not character then
		return nil
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		return root
	end
	return nil
end

local function moveOutOfPortal(player: Player, portal: PortalState)
	local character = player.Character
	if character then
		local exit = portal.pad.CFrame * CFrame.new(0, 4, portal.pad.Size.Z / 2 + 6)
		character:PivotTo(exit)
	end
end

local function refreshLabel(portal: PortalState)
	local cfg = portal.config
	if portal.locked then
		portal.label.Text = `{cfg.DisplayName}\nTeleportando...`
	elseif #portal.members == 0 then
		portal.label.Text = `{cfg.DisplayName}\n0/{cfg.MaxPlayers} - pise aqui!`
	else
		local seconds = math.max(0, math.ceil(portal.timeLeft or 0))
		portal.label.Text = `{cfg.DisplayName}\n{#portal.members}/{cfg.MaxPlayers} - {seconds}s`
	end
end

-- Só manda para os clientes quando algo visível muda.
local function broadcastQueue(portal: PortalState)
	local seconds = math.max(0, math.ceil(portal.timeLeft or 0))
	local key = `{#portal.members}:{seconds}`
	if key == portal.lastKey then
		return
	end
	portal.lastKey = key
	for _, member in portal.members do
		sendStatus(member, {
			kind = "queue",
			portal = portal.config.DisplayName,
			count = #portal.members,
			max = portal.config.MaxPlayers,
			seconds = seconds,
		})
	end
end

local function addToPortal(player: Player, portal: PortalState)
	table.insert(portal.members, player)
	playerPortal[player] = portal
	portal.lastKey = ""
end

local function removeFromPortal(player: Player, notify: boolean)
	local portal = playerPortal[player]
	if not portal then
		return
	end
	local index = table.find(portal.members, player)
	if index then
		table.remove(portal.members, index)
	end
	playerPortal[player] = nil
	portal.lastKey = ""
	if notify and player.Parent == Players then
		sendStatus(player, { kind = "idle" })
	end
end

-- Teleporte ------------------------------------------------------------------

local function launch(portal: PortalState)
	portal.locked = true
	local group = table.clone(portal.members)
	table.clear(portal.members)
	portal.timeLeft = nil
	portal.lastKey = ""

	for _, player in group do
		playerPortal[player] = nil
		teleporting[player] = true
		sendStatus(player, { kind = "teleporting" })
	end
	refreshLabel(portal)

	task.spawn(function()
		local ok, message = TeleportManager.teleportGroup(group, portal.config)
		if not ok then
			for _, player in group do
				if player.Parent == Players then
					teleporting[player] = nil
					moveOutOfPortal(player, portal)
					sendStatus(player, { kind = "failed", message = message or "Erro no teleporte." })
				end
			end
		end
		-- Pequena pausa para os jogadores teleportados saírem antes de reabrir.
		task.wait(if ok then 4 else 1)
		portal.locked = false
		refreshLabel(portal)
	end)
end

-- Se o teleporte falhar depois de começar (ex.: servidor de destino caiu).
TeleportService.TeleportInitFailed:Connect(function(player, result, message)
	warn(`[Hub] TeleportInitFailed para {player.Name}: {result.Name} {message}`)
	teleporting[player] = nil
	sendStatus(player, { kind = "failed", message = "O teleporte falhou. Entre no portal de novo!" })
end)

-- Loop principal ---------------------------------------------------------------

local function updateMembership()
	for _, player in Players:GetPlayers() do
		if teleporting[player] then
			continue
		end

		local root = getRoot(player)
		local current = playerPortal[player]

		if current then
			if not current.locked and (not root or not isInside(current.pad, root.Position)) then
				removeFromPortal(player, true)
			end
		elseif root then
			for _, portal in portals do
				if
					not portal.locked
					and #portal.members < portal.config.MaxPlayers
					and isInside(portal.pad, root.Position)
				then
					addToPortal(player, portal)
					break
				end
			end
		end
	end
end

local function updatePortal(portal: PortalState, dt: number)
	if portal.locked then
		return
	end

	if #portal.members == 0 then
		portal.timeLeft = nil
	else
		local timeLeft = portal.timeLeft or HubConfig.COUNTDOWN_SECONDS
		timeLeft -= dt
		if #portal.members >= portal.config.MaxPlayers then
			timeLeft = math.min(timeLeft, HubConfig.FULL_COUNTDOWN_SECONDS)
		end
		portal.timeLeft = timeLeft

		if timeLeft <= 0 then
			launch(portal)
			return
		end
		broadcastQueue(portal)
	end
	refreshLabel(portal)
end

-- Inicialização --------------------------------------------------------------

for _, config in HubConfig.PORTALS do
	local portal = buildPortal(config)
	table.insert(portals, portal)
	refreshLabel(portal)
end

local accumulator = 0
RunService.Heartbeat:Connect(function(dt)
	accumulator += dt
	if accumulator < TICK then
		return
	end
	local step = accumulator
	accumulator = 0

	updateMembership()
	for _, portal in portals do
		updatePortal(portal, step)
	end
end)

leaveQueueRemote.OnServerEvent:Connect(function(player)
	local now = os.clock()
	if now - (lastLeave[player] or 0) < LEAVE_COOLDOWN then
		return
	end
	lastLeave[player] = now

	local portal = playerPortal[player]
	if portal and not portal.locked then
		removeFromPortal(player, true)
		moveOutOfPortal(player, portal)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	removeFromPortal(player, false)
	teleporting[player] = nil
	lastLeave[player] = nil
end)
