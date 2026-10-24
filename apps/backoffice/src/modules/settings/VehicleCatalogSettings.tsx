import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Form, Input, Pagination, Select, Space, Tag, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { ModalForm, ProFormSwitch, ProFormText } from "@ant-design/pro-components";
import type { ColumnsType } from "antd/es/table";
import { OperationsProTable, operationsKeywordFromFields } from "../shared/OperationsProTable";
import {
  createVehicleCatalogModel,
  getVehicleCatalogModels,
  humanizeApiError,
  updateVehicleCatalogModel,
  type VehicleCatalogModel,
  type VehicleCatalogModelInput
} from "../../api";

const mobileCatalogPageSize = 8;
const addNewMakeValue = "__add_new_make__";
type VehicleCatalogFormValues = Omit<VehicleCatalogModelInput, "make"> & { makeChoice: string; newMake?: string };

export type VehicleCatalogFilters = {
  keyword?: string;
  status?: "active" | "hidden";
};

export function filterVehicleCatalogModels(models: VehicleCatalogModel[], filters: VehicleCatalogFilters) {
  const keyword = filters.keyword?.trim().toLowerCase();

  return models.filter((model) => {
    if (keyword && !`${model.make} ${model.model}`.toLowerCase().includes(keyword)) return false;
    if (filters.status === "active" && !model.isActive) return false;
    if (filters.status === "hidden" && model.isActive) return false;

    return true;
  });
}

export function vehicleCatalogEmptyText(totalModels: number) {
  return totalModels === 0
    ? "No catalogue options yet."
    : "No catalogue options match the current filters.";
}

export function vehicleCatalogMakes(models: VehicleCatalogModel[]) {
  return [...new Set(models.map((item) => item.make.trim().toLocaleUpperCase()))].sort();
}

export function VehicleCatalogSettings() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [catalogModels, setCatalogModels] = useState<VehicleCatalogModel[]>([]);
  const [catalogFilters, setCatalogFilters] = useState<VehicleCatalogFilters>({});
  const [mobileCatalogPage, setMobileCatalogPage] = useState(1);
  const [catalogFormOpen, setCatalogFormOpen] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogSaveError, setCatalogSaveError] = useState<string | null>(null);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [catalogForm] = Form.useForm<VehicleCatalogFormValues>();
  const selectedMake = Form.useWatch("makeChoice", catalogForm);
  const filteredCatalogModels = useMemo(
    () => filterVehicleCatalogModels(catalogModels, catalogFilters),
    [catalogFilters, catalogModels]
  );
  const mobileCatalogPageCount = Math.max(1, Math.ceil(filteredCatalogModels.length / mobileCatalogPageSize));
  const clampedMobileCatalogPage = Math.min(mobileCatalogPage, mobileCatalogPageCount);
  const mobileCatalogModels = filteredCatalogModels.slice(
    (clampedMobileCatalogPage - 1) * mobileCatalogPageSize,
    clampedMobileCatalogPage * mobileCatalogPageSize
  );
  const catalogFilterActive = Object.values(catalogFilters).some((value) => value !== undefined && value !== "");
  const catalogEmptyText = vehicleCatalogEmptyText(catalogModels.length);
  const activeModelCount = catalogModels.filter((item) => item.isActive).length;
  const makeCount = new Set(catalogModels.map((item) => item.make.toLocaleLowerCase())).size;

  const loadCatalogModels = useCallback(async () => {
    try {
      setCatalogModels(await getVehicleCatalogModels());
    } catch (error) {
      messageApi.error(humanizeApiError(error, "Unable to load the vehicle catalogue."));
    }
  }, [messageApi]);

  useEffect(() => {
    void loadCatalogModels();
  }, [loadCatalogModels]);

  useEffect(() => {
    if (mobileCatalogPage !== clampedMobileCatalogPage) {
      setMobileCatalogPage(clampedMobileCatalogPage);
    }
  }, [clampedMobileCatalogPage, mobileCatalogPage]);

  async function saveCatalogModel(values: VehicleCatalogFormValues) {
    const make = (values.makeChoice === addNewMakeValue ? values.newMake : values.makeChoice)?.trim().toLocaleUpperCase();
    if (!make) return false;
    const input: VehicleCatalogModelInput = { make, model: values.model.trim(), isActive: values.isActive };
    setCatalogSaving(true);
    setCatalogSaveError(null);
    try {
      if (catalogEditingId) {
        await updateVehicleCatalogModel(catalogEditingId, input);
        messageApi.success("Vehicle catalogue option updated.");
      } else {
        await createVehicleCatalogModel(input);
        messageApi.success("Vehicle catalogue option added.");
      }
      await loadCatalogModels();
      setCatalogFormOpen(false);
      return true;
    } catch (error) {
      setCatalogSaveError(humanizeApiError(error, "Unable to save the vehicle catalogue option."));
      return false;
    } finally {
      setCatalogSaving(false);
    }
  }

  async function toggleCatalogModel(item: VehicleCatalogModel) {
    try {
      await updateVehicleCatalogModel(item.id, { make: item.make, model: item.model, isActive: !item.isActive });
      messageApi.success(`Vehicle catalogue option ${item.isActive ? "hidden" : "shown"} on the website.`);
      await loadCatalogModels();
    } catch (error) {
      messageApi.error(humanizeApiError(error, "Unable to update the vehicle catalogue option."));
    }
  }

  function openCatalogForm(item?: VehicleCatalogModel) {
    catalogForm.resetFields();
    setCatalogEditingId(item?.id ?? null);
    setCatalogSaveError(null);
    catalogForm.setFieldsValue(item
      ? { makeChoice: item.make.toLocaleUpperCase(), newMake: undefined, model: item.model, isActive: item.isActive }
      : { makeChoice: undefined, newMake: undefined, model: undefined, isActive: true });
    setCatalogFormOpen(true);
  }

  function updateCatalogFilter<K extends keyof VehicleCatalogFilters>(key: K, value: VehicleCatalogFilters[K] | undefined) {
    setMobileCatalogPage(1);
    setCatalogFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  const renderCatalogActions = (item: VehicleCatalogModel) => (
    <Space className="tableActionGroup" wrap size={6}>
      <Button size="small" type="primary" onClick={() => openCatalogForm(item)}>Edit</Button>
      <Button size="small" onClick={() => void toggleCatalogModel(item)}>{item.isActive ? "Hide" : "Show"}</Button>
    </Space>
  );
  const catalogColumns: ColumnsType<VehicleCatalogModel> = [
    { title: "Make / 品牌", dataIndex: "make" },
    { title: "Model / 车型", dataIndex: "model" },
    { title: "Website filter", dataIndex: "isActive", render: (isActive) => <Tag color={isActive ? "green" : "default"}>{isActive ? "Visible" : "Hidden"}</Tag> },
    { title: "Action / 操作", fixed: "right", width: 190, render: (_, item) => renderCatalogActions(item) }
  ];

  return (
    <div className="fullWidth vehicleCatalogSettings">
      {messageContextHolder}
      <div className="settingsOverview">
        <div>
          <span className="moduleEyebrow">Website filters</span>
          <Typography.Title level={3}>Website Make & Model Catalogue / 网站品牌车型目录</Typography.Title>
          <Typography.Text>
            Manage the make and model options shown in public inventory filters without changing existing vehicle records.
          </Typography.Text>
        </div>
        <div className="rbacSummary">
          <span><strong>{makeCount}</strong>makes</span>
          <span><strong>{catalogModels.length}</strong>models</span>
          <span><strong>{activeModelCount}</strong>visible</span>
        </div>
      </div>
      <ModalForm<VehicleCatalogFormValues>
        form={catalogForm}
        name="vehicleCatalog"
        title={catalogEditingId ? "Edit make & model / 编辑品牌车型" : "New make & model / 新增品牌车型"}
        width={520}
        layout="vertical"
        loading={catalogSaving}
        open={catalogFormOpen}
        onOpenChange={(open) => { if (!catalogSaving) setCatalogFormOpen(open); }}
        initialValues={{ isActive: true }}
        onFinish={saveCatalogModel}
        modalProps={{ className: "vehicleCatalogModal", forceRender: true, maskClosable: false, closable: !catalogSaving, keyboard: !catalogSaving }}
        submitter={{
          searchConfig: { submitText: catalogEditingId ? "Save changes" : "Create option", resetText: "Cancel" },
          resetButtonProps: { disabled: catalogSaving },
          submitButtonProps: {
            loading: catalogSaving,
            "aria-label": catalogEditingId ? "Save changes" : "Create option",
            "aria-busy": catalogSaving
          }
        }}
      >
        {catalogSaveError && <Alert type="error" showIcon message={catalogSaveError} className="vehicleCatalogSaveError" />}
        <Form.Item name="makeChoice" label="Make / 品牌" rules={[{ required: true, message: "Select an existing make or add a new one" }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select existing make"
            options={[
              ...vehicleCatalogMakes(catalogModels).map((make) => ({ value: make, label: make })),
              { value: addNewMakeValue, label: "+ Add new make / 新增品牌" }
            ]}
            onChange={(value) => { if (value !== addNewMakeValue) catalogForm.setFieldValue("newMake", undefined); }}
          />
        </Form.Item>
        {selectedMake === addNewMakeValue ? (
          <ProFormText name="newMake" label="New make / 新品牌" rules={[{ required: true, message: "Enter the new make" }]}
            placeholder="BYD" fieldProps={{ maxLength: 80, style: { textTransform: "uppercase" } }} />
        ) : null}
        <ProFormText name="model" label="Model / 车型" rules={[{ required: true, message: "Model is required" }]}
          placeholder="Vios" fieldProps={{ maxLength: 80 }} />
        <ProFormSwitch name="isActive" label="Website visible" />
      </ModalForm>
      <div className="pageFilterMobileOnly vehicleCatalogMobileToolbar">
        <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => openCatalogForm()}>New make & model</Button>
      </div>
      <div className="vehicleOperationFilters pageFilterMobileOnly">
        <Input.Search
          allowClear
          value={catalogFilters.keyword}
          placeholder="Search make or model"
          onChange={(event) => updateCatalogFilter("keyword", event.target.value)}
        />
        <Select
          allowClear
          placeholder="Website status"
          value={catalogFilters.status}
          options={[
            { value: "active", label: "Visible" },
            { value: "hidden", label: "Hidden" }
          ]}
          onChange={(value) => updateCatalogFilter("status", value)}
        />
        <div className="vehicleFilterMeta">
          <Tag color={catalogFilterActive ? "blue" : "default"}>{catalogFilterActive ? `${filteredCatalogModels.length} of ${catalogModels.length} matching` : `${catalogModels.length} option${catalogModels.length === 1 ? "" : "s"}`}</Tag>
          {catalogFilterActive && <Button size="small" onClick={() => { setCatalogFilters({}); setMobileCatalogPage(1); }}>Clear filters</Button>}
        </div>
      </div>
      <div className="mobileRecordList">
        {filteredCatalogModels.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={catalogEmptyText} />}
        {mobileCatalogModels.map((item) => (
          <article className="mobileRecordCard" key={item.id}>
            <div className="mobileRecordHeader">
              <div>
                <Typography.Text className="mobileRecordEyebrow">Website Catalogue</Typography.Text>
                <Typography.Title level={5}>{item.make}</Typography.Title>
              </div>
              <Tag color={item.isActive ? "green" : "default"}>{item.isActive ? "Visible" : "Hidden"}</Tag>
            </div>
            <div className="mobileRecordGrid">
              <div><span>Model / 车型</span><strong>{item.model}</strong></div>
              <div><span>Type</span><strong>Website filter</strong></div>
            </div>
            <div className="mobileRecordFooter">{renderCatalogActions(item)}</div>
          </article>
        ))}
        {filteredCatalogModels.length > mobileCatalogPageSize && (
          <Pagination
            current={clampedMobileCatalogPage}
            pageSize={mobileCatalogPageSize}
            total={filteredCatalogModels.length}
            showSizeChanger={false}
            onChange={setMobileCatalogPage}
          />
        )}
      </div>
      <OperationsProTable
        className="desktopDataTable nativeSearchDesktopOnly vehicleCatalogTable"
        toolBarRender={() => [<Button key="create" type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => openCatalogForm()}>New make & model</Button>]}
        rowKey="id"
        columns={catalogColumns}
        dataSource={filteredCatalogModels}
        nativeSearch={{
          fields: [
            { name: "make", label: "Make" },
            { name: "model", label: "Model" },
            { name: "status", label: "Website status", options: [
              { value: "active", label: "Visible" },
              { value: "hidden", label: "Hidden" }
            ] }
          ],
          values: { status: catalogFilters.status },
          onSubmit: (values) => {
            setCatalogFilters({
              keyword: operationsKeywordFromFields(values, ["make", "model"]),
              status: values.status as VehicleCatalogFilters["status"] | undefined
            });
            setMobileCatalogPage(1);
          },
          onReset: () => {
            setCatalogFilters({});
            setMobileCatalogPage(1);
          }
        }}
        pagination={{ pageSize: 8, showSizeChanger: false, current: clampedMobileCatalogPage, onChange: setMobileCatalogPage }}
        scroll={{ x: 640 }}
        locale={{ emptyText: catalogEmptyText }}
      />
    </div>
  );
}
