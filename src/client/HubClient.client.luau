--!strict
-- Interface da fila do Hub e tela de carregamento do teleporte.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TeleportService = game:GetService("TeleportService")
local TweenService = game:GetService("TweenService")

local HubConfig = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("HubConfig"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui") :: PlayerGui

local remotes = ReplicatedStorage:WaitForChild("HubRemotes")
local queueStatusRemote = remotes:WaitForChild("QueueStatus") :: RemoteEvent
local leaveQueueRemote = remotes:WaitForChild("LeaveQueue") :: RemoteEvent

-- Painel da fila ---------------------------------------------------------------

local gui = Instance.new("ScreenGui")
gui.Name = "HubQueue"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = playerGui

local panel = Instance.new("Frame")
panel.AnchorPoint = Vector2.new(0.5, 1)
panel.Position = UDim2.new(0.5, 0, 1, -40)
panel.Size = UDim2.fromOffset(340, 110)
panel.BackgroundColor3 = Color3.fromRGB(15, 30, 55)
panel.BackgroundTransparency = 0.15
panel.Visible = false
panel.Parent = gui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 14)
corner.Parent = panel

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(80, 200, 255)
stroke.Thickness = 2
stroke.Parent = panel

local sizeLimit = Instance.new("UISizeConstraint")
sizeLimit.MaxSize = Vector2.new(340, 110)
sizeLimit.Parent = panel

local statusLabel = Instance.new("TextLabel")
statusLabel.Position = UDim2.fromOffset(12, 8)
statusLabel.Size = UDim2.new(1, -24, 0, 50)
statusLabel.BackgroundTransparency = 1
statusLabel.Font = Enum.Font.FredokaOne
statusLabel.TextScaled = true
statusLabel.TextColor3 = Color3.new(1, 1, 1)
statusLabel.Text = ""
statusLabel.Parent = panel

local leaveButton = Instance.new("TextButton")
leaveButton.AnchorPoint = Vector2.new(0.5, 1)
leaveButton.Position = UDim2.new(0.5, 0, 1, -10)
leaveButton.Size = UDim2.fromOffset(160, 36)
leaveButton.BackgroundColor3 = Color3.fromRGB(230, 70, 70)
leaveButton.Font = Enum.Font.FredokaOne
leaveButton.TextScaled = true
leaveButton.TextColor3 = Color3.new(1, 1, 1)
leaveButton.Text = "Sair da fila"
leaveButton.Parent = panel

local buttonCorner = Instance.new("UICorner")
buttonCorner.CornerRadius = UDim.new(0, 10)
buttonCorner.Parent = leaveButton

leaveButton.Activated:Connect(function()
	leaveQueueRemote:FireServer()
end)

-- Tela de carregamento ---------------------------------------------------------
-- Também é mostrada no lugar de destino enquanto ele carrega (SetTeleportGui).

local function buildLoadingScreen(): ScreenGui
	local screen = Instance.new("ScreenGui")
	screen.Name = "TeleportScreen"
	screen.IgnoreGuiInset = true
	screen.DisplayOrder = 100
	screen.ResetOnSpawn = false

	local background = Instance.new("Frame")
	background.Name = "Background"
	background.Size = UDim2.fromScale(1, 1)
	background.BackgroundColor3 = Color3.fromRGB(8, 20, 40)
	background.Parent = screen

	local gradient = Instance.new("UIGradient")
	gradient.Rotation = 90
	gradient.Color = ColorSequence.new(Color3.fromRGB(20, 80, 140), Color3.fromRGB(5, 10, 25))
	gradient.Parent = background

	local title = Instance.new("TextLabel")
	title.AnchorPoint = Vector2.new(0.5, 0.5)
	title.Position = UDim2.fromScale(0.5, 0.5)
	title.Size = UDim2.fromScale(0.8, 0.12)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.FredokaOne
	title.TextScaled = true
	title.TextColor3 = Color3.new(1, 1, 1)
	title.Text = "🎣 Indo pescar..."
	title.Parent = background

	return screen
end

local loadingScreen = buildLoadingScreen()
TeleportService:SetTeleportGui(loadingScreen)

local function showLoading(visible: boolean)
	local background = loadingScreen:FindFirstChild("Background") :: Frame
	if visible then
		background.BackgroundTransparency = 1
		loadingScreen.Parent = playerGui
		TweenService:Create(background, TweenInfo.new(0.4), { BackgroundTransparency = 0 }):Play()
	else
		loadingScreen.Parent = nil
	end
end

-- Status vindo do servidor -------------------------------------------------------

local messageToken = 0

queueStatusRemote.OnClientEvent:Connect(function(raw)
	local status = raw :: HubConfig.QueueStatus
	messageToken += 1

	if status.kind == "queue" then
		showLoading(false)
		panel.Visible = true
		leaveButton.Visible = true
		statusLabel.Text = `{status.portal} ({status.count}/{status.max})\nSaindo em {status.seconds}s`
	elseif status.kind == "teleporting" then
		panel.Visible = false
		showLoading(true)
	elseif status.kind == "failed" then
		showLoading(false)
		panel.Visible = true
		leaveButton.Visible = false
		statusLabel.Text = status.message

		local token = messageToken
		task.delay(4, function()
			if token == messageToken then
				panel.Visible = false
			end
		end)
	else
		panel.Visible = false
	end
end)
